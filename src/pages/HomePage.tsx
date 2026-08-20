import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <main className="page">
      <p className="brand">deepseek-harness-desktop</p>
      <h1>DeepSeek Harness 的可信桌面宿主</h1>
      <p className="lead">
        由本壳管理安装、进程与更新；主界面将接入官方 Web UI（B2）。当前为空壳占位。
      </p>
      <p>
        <Link to="/settings">设置</Link>
      </p>
    </main>
  );
}
