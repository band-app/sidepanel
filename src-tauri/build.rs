use std::fmt::Write;

fn main() {
    let out_dir = std::env::var("OUT_DIR").unwrap();

    // Generate bundled_scripts.rs from all files in scripts/.
    // These are the helper scripts (chrome-launch, iterm-setup, etc.) that are
    // baked into the binary at compile time and written to ~/.band-sidepanel/scripts/
    // on first run.
    let scripts_dir = std::path::Path::new("scripts");
    let mut entries: Vec<_> = std::fs::read_dir(scripts_dir)
        .expect("scripts/ directory must exist")
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .collect();
    entries.sort_by_key(std::fs::DirEntry::file_name);

    let mut code = String::from("pub const BUNDLED_SCRIPTS: &[(&str, &str)] = &[\n");
    for entry in &entries {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let abs_path = entry.path().canonicalize().unwrap();
        let abs_path = abs_path.to_string_lossy();
        let _ = writeln!(code, "    (\"{name}\", include_str!(\"{abs_path}\")),");
    }
    code.push_str("];\n");

    std::fs::write(format!("{out_dir}/bundled_scripts.rs"), code).unwrap();

    // Re-run if scripts change
    println!("cargo:rerun-if-changed=scripts");

    tauri_build::build();
}
