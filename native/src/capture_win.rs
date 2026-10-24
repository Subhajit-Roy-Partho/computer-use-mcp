//! Windows screen and window capture (7.7.0, W3 and K6).
//!
//! Window capture used `GetDC` and an unchecked `BitBlt`, which returns black for anything DirectComposition or the GPU
//! draws (Calculator and the other Store apps, many Chromium and Electron windows) and the wrong pixels when the window
//! is covered. It now climbs a ladder and says which rung it used:
//!
//! 1. `PrintWindow(PW_RENDERFULLCONTENT)`: the window draws itself into our bitmap, covered or not.
//! 2. Windows.Graphics.Capture: the compositor's own frame of the window, for windows `PrintWindow` cannot draw.
//! 3. A crop of the screen capture at the window's frame, flagged `occluded` when another window covers part of it.
//! 4. `BitBlt` of the window's DC, last, and marked as such.
//!
//! A minimised window has nothing to capture and is refused by name. Screen capture duplicates the output of the
//! requested monitor (every monitor, not only output 0 of adapter 0), copies the first frame it acquires (an
//! unwritten staging texture came back black on a still desktop), and checks every GDI result.

use std::collections::HashMap;
use std::sync::Mutex;
use windows::core::Interface;
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Direct3D::*;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::UI::WindowsAndMessaging::*;

/// BGRA pixels of a rectangle of the virtual desktop.
pub struct Frame {
    pub bgra: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub left: i32,
    pub top: i32,
}

pub struct WindowFrame {
    pub frame: Frame,
    /// `print_window`, `graphics_capture`, `screen_crop` or `bitblt`.
    pub method: &'static str,
    /// Only meaningful for `screen_crop`: part of the window was covered when the screen was captured.
    pub occluded: bool,
}

// ── Monitors ────────────────────────────────────────────────────────────

pub fn primary_monitor() -> HMONITOR {
    unsafe { MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY) }
}

pub fn monitor_rect(monitor: HMONITOR) -> Option<RECT> {
    let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
    unsafe { GetMonitorInfoW(monitor, &mut info).as_bool().then_some(info.rcMonitor) }
}

// ── DXGI desktop duplication, one per output ────────────────────────────

struct OutputDuplication {
    context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    staging: ID3D11Resource,
    width: u32,
    height: u32,
    rect: RECT,
    /// Whether a frame was ever copied into `staging`. Mapping it before that read uninitialised memory (W3).
    has_frame: bool,
}

// Safety: every call reaches this from the thread that runs N-API calls; the mutex serialises access.
unsafe impl Send for OutputDuplication {}

static DUPLICATIONS: Mutex<Option<HashMap<isize, OutputDuplication>>> = Mutex::new(None);

fn duplicate_output(monitor: HMONITOR) -> Result<OutputDuplication, String> {
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().map_err(|e| format!("CreateDXGIFactory1: {e}"))?;
        let mut adapter_index = 0;
        while let Ok(adapter) = factory.EnumAdapters1(adapter_index) {
            adapter_index += 1;
            let mut output_index = 0;
            while let Ok(output) = adapter.EnumOutputs(output_index) {
                output_index += 1;
                let desc = output.GetDesc().map_err(|e| format!("output desc: {e}"))?;
                if desc.Monitor != monitor {
                    continue;
                }
                let mut device: Option<ID3D11Device> = None;
                let mut context: Option<ID3D11DeviceContext> = None;
                D3D11CreateDevice(
                    &adapter,
                    D3D_DRIVER_TYPE_UNKNOWN,
                    None,
                    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                    None,
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    None,
                    Some(&mut context),
                )
                .map_err(|e| format!("D3D11CreateDevice: {e}"))?;
                let device = device.ok_or("no D3D11 device")?;
                let context = context.ok_or("no D3D11 context")?;
                let output1: IDXGIOutput1 = output.cast().map_err(|e| format!("IDXGIOutput1: {e}"))?;
                let duplication = output1.DuplicateOutput(&device).map_err(|e| format!("DuplicateOutput: {e}"))?;
                let mode = duplication.GetDesc();
                let tex_desc = D3D11_TEXTURE2D_DESC {
                    Width: mode.ModeDesc.Width,
                    Height: mode.ModeDesc.Height,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                    Usage: D3D11_USAGE_STAGING,
                    BindFlags: 0,
                    CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                    MiscFlags: 0,
                };
                let mut staging: Option<ID3D11Texture2D> = None;
                device
                    .CreateTexture2D(&tex_desc, None, Some(&mut staging))
                    .map_err(|e| format!("staging texture: {e}"))?;
                let staging: ID3D11Resource =
                    staging.ok_or("no staging texture")?.cast().map_err(|e| format!("staging resource: {e}"))?;
                return Ok(OutputDuplication {
                    context,
                    duplication,
                    staging,
                    width: mode.ModeDesc.Width,
                    height: mode.ModeDesc.Height,
                    rect: desc.DesktopCoordinates,
                    has_frame: false,
                });
            }
        }
        Err("no DXGI output for this monitor".into())
    }
}

/// Acquire the next frame within `timeout_ms` and copy it to staging. `Ok(false)`: no new frame (a still screen).
unsafe fn acquire(dup: &mut OutputDuplication, timeout_ms: u32) -> Result<bool, String> {
    let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
    let mut resource: Option<IDXGIResource> = None;
    match dup.duplication.AcquireNextFrame(timeout_ms, &mut info, &mut resource) {
        Ok(()) => {
            let copied = (|| -> Result<(), String> {
                let resource = resource.as_ref().ok_or("frame without a resource")?;
                let texture: ID3D11Texture2D = resource.cast().map_err(|e| format!("frame texture: {e}"))?;
                let texture: ID3D11Resource = texture.cast().map_err(|e| format!("frame resource: {e}"))?;
                dup.context.CopyResource(&dup.staging, &texture);
                Ok(())
            })();
            let _ = dup.duplication.ReleaseFrame();
            copied?;
            // A frame that only moved the pointer carries no new desktop image; it still holds the last one.
            dup.has_frame = true;
            Ok(true)
        }
        Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => Ok(false),
        Err(e) => Err(format!("AcquireNextFrame: {e}")),
    }
}

fn capture_monitor_dxgi(monitor: HMONITOR) -> Result<Frame, String> {
    let mut cache = DUPLICATIONS.lock().map_err(|e| format!("lock: {e}"))?;
    let map = cache.get_or_insert_with(HashMap::new);
    let key = monitor.0 as isize;
    if !map.contains_key(&key) {
        map.insert(key, duplicate_output(monitor)?);
    }
    let dup = map.get_mut(&key).expect("inserted above");
    let result = unsafe {
        (|| -> Result<Frame, String> {
            // Prefer a fresh frame; on a still screen, the last copied one is current.
            let mut fresh = false;
            for _ in 0..3 {
                if acquire(dup, 100)? {
                    fresh = true;
                    break;
                }
            }
            // Never map a staging texture nothing was copied into: wait for the first frame a little longer.
            let mut waited = 0;
            while !fresh && !dup.has_frame && waited < 1000 {
                fresh = acquire(dup, 100)?;
                waited += 100;
            }
            if !dup.has_frame {
                return Err("desktop duplication produced no frame".into());
            }
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            dup.context
                .Map(&dup.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .map_err(|e| format!("Map: {e}"))?;
            let row_pitch = mapped.RowPitch as usize;
            let (w, h) = (dup.width, dup.height);
            let mut bgra = Vec::with_capacity((w * h * 4) as usize);
            let src = mapped.pData as *const u8;
            for y in 0..h as usize {
                bgra.extend_from_slice(std::slice::from_raw_parts(src.add(y * row_pitch), w as usize * 4));
            }
            dup.context.Unmap(&dup.staging, 0);
            Ok(Frame { bgra, width: w, height: h, left: dup.rect.left, top: dup.rect.top })
        })()
    };
    if result.is_err() {
        // Access lost (a mode change, the secure desktop): rebuild on the next call.
        map.remove(&key);
    }
    result
}

// ── GDI ─────────────────────────────────────────────────────────────────

/// BitBlt a rectangle from a DC into BGRA, checking every step (W3: the results used to be ignored).
unsafe fn blit(source: HDC, x: i32, y: i32, width: i32, height: i32) -> Result<Vec<u8>, String> {
    if width <= 0 || height <= 0 {
        return Err("empty rectangle".into());
    }
    let memory = CreateCompatibleDC(source);
    if memory.is_invalid() {
        return Err("CreateCompatibleDC failed".into());
    }
    let bitmap = CreateCompatibleBitmap(source, width, height);
    if bitmap.is_invalid() {
        let _ = DeleteDC(memory);
        return Err("CreateCompatibleBitmap failed".into());
    }
    let old = SelectObject(memory, bitmap);
    let copied = BitBlt(memory, 0, 0, width, height, source, x, y, SRCCOPY | CAPTUREBLT);
    let pixels = read_bitmap(memory, bitmap, width, height);
    SelectObject(memory, old);
    let _ = DeleteObject(bitmap);
    let _ = DeleteDC(memory);
    copied.map_err(|e| format!("BitBlt: {e}"))?;
    pixels
}

unsafe fn read_bitmap(dc: HDC, bitmap: HBITMAP, width: i32, height: i32) -> Result<Vec<u8>, String> {
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: 0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let lines = GetDIBits(dc, bitmap, 0, height as u32, Some(pixels.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
    if lines == 0 {
        return Err("GetDIBits failed".into());
    }
    Ok(pixels)
}

fn capture_monitor_gdi(monitor: HMONITOR) -> Result<Frame, String> {
    let rect = monitor_rect(monitor).ok_or("GetMonitorInfo failed")?;
    unsafe {
        let screen = GetDC(None);
        if screen.is_invalid() {
            return Err("GetDC failed".into());
        }
        let (w, h) = (rect.right - rect.left, rect.bottom - rect.top);
        let pixels = blit(screen, rect.left, rect.top, w, h);
        ReleaseDC(None, screen);
        Ok(Frame { bgra: pixels?, width: w as u32, height: h as u32, left: rect.left, top: rect.top })
    }
}

/// Capture a whole monitor: desktop duplication, then GDI. The error names a locked or disconnected session.
pub fn capture_monitor(monitor: Option<HMONITOR>) -> napi::Result<Frame> {
    crate::dpi::ensure();
    let monitor = monitor.unwrap_or_else(primary_monitor);
    match capture_monitor_dxgi(monitor) {
        Ok(frame) => Ok(frame),
        Err(dxgi) => capture_monitor_gdi(monitor).map_err(|gdi| {
            napi::Error::from_reason(crate::session_state::explain_capture_failure(&format!("{dxgi}; GDI: {gdi}")))
        }),
    }
}

// ── Window capture ladder ───────────────────────────────────────────────

/// True when every sampled pixel is black: what a capture of a window the API could not draw looks like.
fn looks_black(bgra: &[u8]) -> bool {
    let pixels = bgra.len() / 4;
    if pixels == 0 {
        return true;
    }
    let step = (pixels / 997).max(1);
    (0..pixels).step_by(step).all(|i| bgra[i * 4] < 8 && bgra[i * 4 + 1] < 8 && bgra[i * 4 + 2] < 8)
}

/// Copy `bounds` (screen coordinates) out of a frame that covers `frame_rect`.
fn crop(frame: &Frame, bounds: &RECT) -> Option<Frame> {
    let left = bounds.left.max(frame.left);
    let top = bounds.top.max(frame.top);
    let right = bounds.right.min(frame.left + frame.width as i32);
    let bottom = bounds.bottom.min(frame.top + frame.height as i32);
    if right <= left || bottom <= top {
        return None;
    }
    let (w, h) = ((right - left) as usize, (bottom - top) as usize);
    let mut bgra = Vec::with_capacity(w * h * 4);
    for row in 0..h {
        let y = (top - frame.top) as usize + row;
        let x = (left - frame.left) as usize;
        let start = (y * frame.width as usize + x) * 4;
        bgra.extend_from_slice(&frame.bgra[start..start + w * 4]);
    }
    Some(Frame { bgra, width: w as u32, height: h as u32, left, top })
}

fn print_window(hwnd: HWND, bounds: &RECT) -> Result<Frame, String> {
    const PW_RENDERFULLCONTENT: u32 = 0x2;
    unsafe {
        let mut window = RECT::default();
        GetWindowRect(hwnd, &mut window).map_err(|e| format!("GetWindowRect: {e}"))?;
        let (w, h) = (window.right - window.left, window.bottom - window.top);
        if w <= 0 || h <= 0 {
            return Err("empty window".into());
        }
        let screen = GetDC(None);
        if screen.is_invalid() {
            return Err("GetDC failed".into());
        }
        let memory = CreateCompatibleDC(screen);
        let bitmap = CreateCompatibleBitmap(screen, w, h);
        ReleaseDC(None, screen);
        if memory.is_invalid() || bitmap.is_invalid() {
            let _ = DeleteObject(bitmap);
            let _ = DeleteDC(memory);
            return Err("bitmap allocation failed".into());
        }
        let old = SelectObject(memory, bitmap);
        let printed = windows::Win32::Storage::Xps::PrintWindow(
            hwnd,
            memory,
            windows::Win32::Storage::Xps::PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT),
        )
        .as_bool();
        let pixels = read_bitmap(memory, bitmap, w, h);
        SelectObject(memory, old);
        let _ = DeleteObject(bitmap);
        let _ = DeleteDC(memory);
        if !printed {
            return Err("PrintWindow failed".into());
        }
        let whole = Frame { bgra: pixels?, width: w as u32, height: h as u32, left: window.left, top: window.top };
        // The bitmap includes the invisible resize borders; keep the visible frame.
        let frame = crop(&whole, bounds).ok_or("window outside its own rectangle")?;
        if looks_black(&frame.bgra) {
            return Err("PrintWindow drew nothing (black)".into());
        }
        Ok(frame)
    }
}

fn graphics_capture(hwnd: HWND, bounds: &RECT) -> Result<Frame, String> {
    use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession};
    use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
    use windows::Graphics::DirectX::DirectXPixelFormat;
    use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};
    use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
        if !GraphicsCaptureSession::IsSupported().unwrap_or(false) {
            return Err("Windows.Graphics.Capture is not supported here".into());
        }
        let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
            .map_err(|e| format!("capture interop: {e}"))?;
        let item: GraphicsCaptureItem = interop.CreateForWindow(hwnd).map_err(|e| format!("CreateForWindow: {e}"))?;
        let size = item.Size().map_err(|e| format!("item size: {e}"))?;
        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            None,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .map_err(|e| format!("D3D11CreateDevice: {e}"))?;
        let device = device.ok_or("no D3D11 device")?;
        let context = context.ok_or("no D3D11 context")?;
        let dxgi: IDXGIDevice = device.cast().map_err(|e| format!("IDXGIDevice: {e}"))?;
        let inspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi).map_err(|e| format!("WinRT device: {e}"))?;
        let winrt_device: IDirect3DDevice = inspectable.cast().map_err(|e| format!("IDirect3DDevice: {e}"))?;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            1,
            size,
        )
        .map_err(|e| format!("frame pool: {e}"))?;
        let session = pool.CreateCaptureSession(&item).map_err(|e| format!("capture session: {e}"))?;
        // Best effort: older Windows lacks these, and a borderless capture may need a grant; the capture still works.
        let _ = session.SetIsCursorCaptureEnabled(false);
        let _ = session.SetIsBorderRequired(false);
        let close = || {
            let _ = session.Close();
            let _ = pool.Close();
        };
        if let Err(e) = session.StartCapture() {
            close();
            return Err(format!("StartCapture: {e}"));
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1500);
        let frame = loop {
            match pool.TryGetNextFrame() {
                Ok(frame) => break frame,
                Err(_) if std::time::Instant::now() < deadline => std::thread::sleep(std::time::Duration::from_millis(10)),
                Err(e) => {
                    close();
                    return Err(format!("no frame within 1.5 s: {e}"));
                }
            }
        };
        let result = (|| -> Result<Frame, String> {
            let content = frame.ContentSize().map_err(|e| format!("content size: {e}"))?;
            let surface = frame.Surface().map_err(|e| format!("surface: {e}"))?;
            let access: IDirect3DDxgiInterfaceAccess = surface.cast().map_err(|e| format!("surface access: {e}"))?;
            let texture: ID3D11Texture2D = access.GetInterface().map_err(|e| format!("surface texture: {e}"))?;
            let mut desc = D3D11_TEXTURE2D_DESC::default();
            texture.GetDesc(&mut desc);
            let staging_desc = D3D11_TEXTURE2D_DESC {
                Usage: D3D11_USAGE_STAGING,
                BindFlags: 0,
                CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                MiscFlags: 0,
                ..desc
            };
            let mut staging: Option<ID3D11Texture2D> = None;
            device
                .CreateTexture2D(&staging_desc, None, Some(&mut staging))
                .map_err(|e| format!("staging: {e}"))?;
            let staging: ID3D11Resource = staging.ok_or("no staging")?.cast().map_err(|e| format!("staging: {e}"))?;
            let source: ID3D11Resource = texture.cast().map_err(|e| format!("texture: {e}"))?;
            context.CopyResource(&staging, &source);
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).map_err(|e| format!("Map: {e}"))?;
            let w = (content.Width.max(1) as u32).min(desc.Width);
            let h = (content.Height.max(1) as u32).min(desc.Height);
            let mut bgra = Vec::with_capacity((w * h * 4) as usize);
            let src = mapped.pData as *const u8;
            for y in 0..h as usize {
                bgra.extend_from_slice(std::slice::from_raw_parts(src.add(y * mapped.RowPitch as usize), w as usize * 4));
            }
            context.Unmap(&staging, 0);
            Ok(Frame { bgra, width: w, height: h, left: bounds.left, top: bounds.top })
        })();
        let _ = frame.Close();
        close();
        let frame = result?;
        if looks_black(&frame.bgra) {
            return Err("Windows.Graphics.Capture returned a black frame".into());
        }
        Ok(frame)
    }
}

/// Whether another top-level window covers part of `bounds`: a 4 x 4 grid of points, each checked for whose window it
/// lands on.
fn occluded(hwnd: HWND, bounds: &RECT) -> bool {
    let (w, h) = (bounds.right - bounds.left, bounds.bottom - bounds.top);
    for i in 1..=4 {
        for j in 1..=4 {
            let point = POINT { x: bounds.left + w * i / 5, y: bounds.top + h * j / 5 };
            unsafe {
                let at = WindowFromPoint(point);
                if at.0.is_null() {
                    continue;
                }
                if GetAncestor(at, GA_ROOT) != hwnd {
                    return true;
                }
            }
        }
    }
    false
}

/// Capture one window, climbing the ladder above. Every rung that fails says why in the final error.
pub fn capture_window(window_id: u32) -> napi::Result<WindowFrame> {
    crate::dpi::ensure();
    let hwnd = HWND(window_id as usize as *mut _);
    unsafe {
        if !IsWindow(hwnd).as_bool() {
            return Err(napi::Error::from_reason(format!("window_not_found: no window {window_id}")));
        }
        if IsIconic(hwnd).as_bool() {
            return Err(napi::Error::from_reason(format!(
                "window_minimized: window {window_id} is minimised, so there is nothing on screen to capture. \
                 Restore it first (activate_window or unhide_app), or capture the screen."
            )));
        }
    }
    let bounds = crate::win_util::visible_bounds(hwnd);
    let mut failures = Vec::new();
    match print_window(hwnd, &bounds) {
        Ok(frame) => return Ok(WindowFrame { frame, method: "print_window", occluded: false }),
        Err(e) => failures.push(format!("PrintWindow: {e}")),
    }
    match graphics_capture(hwnd, &bounds) {
        Ok(frame) => return Ok(WindowFrame { frame, method: "graphics_capture", occluded: false }),
        Err(e) => failures.push(format!("Windows.Graphics.Capture: {e}")),
    }
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    match capture_monitor(Some(monitor)) {
        Ok(screen) => {
            if let Some(frame) = crop(&screen, &bounds) {
                return Ok(WindowFrame { frame, method: "screen_crop", occluded: occluded(hwnd, &bounds) });
            }
            failures.push("screen crop: the window is off its monitor".into());
        }
        Err(e) => failures.push(format!("screen: {}", e.reason)),
    }
    unsafe {
        let dc = GetWindowDC(hwnd);
        if !dc.is_invalid() {
            let mut window = RECT::default();
            let _ = GetWindowRect(hwnd, &mut window);
            let pixels = blit(dc, 0, 0, window.right - window.left, window.bottom - window.top);
            ReleaseDC(hwnd, dc);
            match pixels {
                Ok(bgra) => {
                    let whole = Frame {
                        bgra,
                        width: (window.right - window.left) as u32,
                        height: (window.bottom - window.top) as u32,
                        left: window.left,
                        top: window.top,
                    };
                    if let Some(frame) = crop(&whole, &bounds) {
                        return Ok(WindowFrame { frame, method: "bitblt", occluded: false });
                    }
                }
                Err(e) => failures.push(format!("BitBlt: {e}")),
            }
        }
    }
    Err(napi::Error::from_reason(crate::session_state::explain_capture_failure(&format!(
        "window {window_id} could not be captured: {}",
        failures.join("; ")
    ))))
}

#[cfg(test)]
mod tests {
    use super::{crop, looks_black, Frame};
    use windows::Win32::Foundation::RECT;

    fn frame(width: u32, height: u32, left: i32, top: i32) -> Frame {
        let mut bgra = Vec::new();
        for y in 0..height {
            for x in 0..width {
                bgra.extend_from_slice(&[x as u8, y as u8, 200, 255]);
            }
        }
        Frame { bgra, width, height, left, top }
    }

    #[test]
    fn crop_takes_the_window_rectangle_out_of_a_monitor_frame() {
        // A monitor at (-1920, 0); the window's visible frame at (-1900, 10)-(-1890, 14).
        let screen = frame(64, 32, -1920, 0);
        let window = crop(&screen, &RECT { left: -1900, top: 10, right: -1890, bottom: 14 }).unwrap();
        assert_eq!((window.width, window.height, window.left, window.top), (10, 4, -1900, 10));
        assert_eq!(&window.bgra[0..2], &[20, 10]); // x = 20, y = 10 inside the monitor frame
        assert!(crop(&screen, &RECT { left: 0, top: 0, right: 10, bottom: 10 }).is_none(), "off this monitor");
    }

    #[test]
    fn black_detection_needs_every_sample_black() {
        assert!(looks_black(&vec![0u8; 4 * 1000]));
        let mut almost = vec![0u8; 4 * 1000];
        almost[4 * 500 + 2] = 255;
        assert!(!looks_black(&almost));
        assert!(!looks_black(&frame(10, 10, 0, 0).bgra));
    }
}
