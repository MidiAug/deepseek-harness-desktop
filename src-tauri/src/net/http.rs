//! 唯一 `http_client`：install / update 下载与 registry 查询共用。

use crate::error::HostError;
use crate::settings::ShellSettings;

pub fn http_client(settings: &ShellSettings) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().user_agent("deepseek-harness-desktop/0.1");
    if let Some(proxy) = settings.resolved_proxy_url() {
        log::debug!(target: "shell::net", "http_client proxy enabled");
        let proxy = reqwest::Proxy::all(&proxy)
            .map_err(|e| String::from(HostError::install(format!("无效代理 {proxy}: {e}"))))?;
        builder = builder.proxy(proxy);
    } else {
        builder = builder.no_proxy();
    }
    builder
        .build()
        .map_err(|e| String::from(HostError::install(format!("http client: {e}"))))
}
