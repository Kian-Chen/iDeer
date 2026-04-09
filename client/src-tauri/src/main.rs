#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use tauri::Manager;

struct ManagedBackend {
    child: Mutex<Option<Child>>,
}

impl Default for ManagedBackend {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

impl ManagedBackend {
    fn start(&self) -> Result<String, String> {
        let mut child_guard = self.child.lock().map_err(|_| "backend lock poisoned".to_string())?;
        if child_guard.is_some() {
            return Ok("backend already running".into());
        }

        let project_root = project_root();
        let mut last_error: Option<String> = None;

        let python_candidates: [(&str, &[&str]); 2] = [
            ("python", &["web_server.py"]),
            ("py", &["-3", "web_server.py"]),
        ];

        for (program, args) in python_candidates {
            match spawn_backend(program, args, &project_root) {
                Ok(child) => {
                    *child_guard = Some(child);
                    return Ok(format!("started backend from {}", project_root.display()));
                }
                Err(error) => {
                    last_error = Some(format!("{}: {}", program, error));
                }
            }
        }

        Err(last_error.unwrap_or_else(|| "failed to start backend".into()))
    }

    fn stop(&self) -> Result<(), String> {
        let mut child_guard = self.child.lock().map_err(|_| "backend lock poisoned".to_string())?;
        if let Some(mut child) = child_guard.take() {
            child.kill().map_err(|error| error.to_string())?;
            let _ = child.wait();
        }
        Ok(())
    }
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."))
}

fn spawn_backend(program: &str, args: &[&str], cwd: &Path) -> std::io::Result<Child> {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    command.spawn()
}

fn open_external_with_system(url: &str) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("only http and https urls are supported".into());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
}

#[tauri::command]
fn start_backend(state: tauri::State<ManagedBackend>) -> Result<String, String> {
    state.start()
}

#[tauri::command]
fn stop_backend(state: tauri::State<ManagedBackend>) -> Result<(), String> {
    state.stop()
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    open_external_with_system(&url)
}

fn main() {
    tauri::Builder::default()
        .manage(ManagedBackend::default())
        .invoke_handler(tauri::generate_handler![start_backend, stop_backend, open_external])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<ManagedBackend>();
                let _ = state.stop();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running iDeer desktop");
}
