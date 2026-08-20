import { Link } from "react-router-dom";

export function SettingsPage() {
  return (
    <main className="page">
      <p className="brand">设置</p>
      <h1>占位</h1>
      <p className="lead">代理、数据目录与版本信息将在后续批次提供。</p>
      <p>
        <Link to="/">返回</Link>
      </p>
    </main>
  );
}
