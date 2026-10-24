//! Slow native calls on a worker thread (7.7.0, K4).
//!
//! An accessibility walk of a large window, a capture, or a Windows activation that waits for the foreground can take
//! seconds. Called synchronously it holds the JavaScript thread, so the status card's Stop, a host cancellation and
//! every other request wait behind it. Each `*_async` export runs the same function on a libuv worker and resolves a
//! promise with the same JSON the synchronous call returns.

use napi::bindgen_prelude::{AsyncTask, ToNapiValue, TypeName};
use napi::{sys, Env, Task, ValueType};

/// The JSON a job produced, handed to JavaScript as-is.
pub struct Json(serde_json::Value);

impl TypeName for Json {
    fn type_name() -> &'static str {
        "unknown"
    }

    fn value_type() -> ValueType {
        ValueType::Unknown
    }
}

impl ToNapiValue for Json {
    unsafe fn to_napi_value(env: sys::napi_env, val: Self) -> napi::Result<sys::napi_value> {
        serde_json::Value::to_napi_value(env, val.0)
    }
}

type Job = Box<dyn FnOnce() -> napi::Result<serde_json::Value> + Send>;

pub struct JsonTask(Option<Job>);

impl Task for JsonTask {
    type Output = serde_json::Value;
    type JsValue = Json;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        // Workers start DPI-unaware on Windows; coordinates must agree with the JavaScript thread's.
        crate::dpi::ensure();
        let job = self.0.take().ok_or_else(|| napi::Error::from_reason("the task already ran"))?;
        with_autorelease_pool(job)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(Json(output))
    }
}

/// Run `job` on a libuv worker.
pub fn spawn(job: impl FnOnce() -> napi::Result<serde_json::Value> + Send + 'static) -> AsyncTask<JsonTask> {
    AsyncTask::new(JsonTask(Some(Box::new(job))))
}

/// A worker thread lives as long as the process and never drains an autorelease pool, so anything AppKit autoreleases
/// there would be kept forever. Each job gets its own pool.
#[cfg(target_os = "macos")]
fn with_autorelease_pool(job: Job) -> napi::Result<serde_json::Value> {
    extern "C" {
        fn objc_autoreleasePoolPush() -> *mut std::ffi::c_void;
        fn objc_autoreleasePoolPop(context: *mut std::ffi::c_void);
    }
    let pool = unsafe { objc_autoreleasePoolPush() };
    let result = job();
    unsafe { objc_autoreleasePoolPop(pool) };
    result
}

#[cfg(not(target_os = "macos"))]
fn with_autorelease_pool(job: Job) -> napi::Result<serde_json::Value> {
    job()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_task_runs_its_job_once() {
        let mut task = JsonTask(Some(Box::new(|| Ok(serde_json::json!({ "ok": true })))));
        assert_eq!(task.compute().unwrap(), serde_json::json!({ "ok": true }));
        assert!(task.compute().is_err(), "a second compute has nothing to run");
    }

    #[test]
    fn a_failing_job_rejects() {
        let mut task = JsonTask(Some(Box::new(|| Err(napi::Error::from_reason("window_not_found:7")))));
        assert_eq!(task.compute().unwrap_err().reason, "window_not_found:7");
    }
}
