import { WalletsConsoleLoader } from "../../components/WalletsConsoleClient";

// 地址库是重表格页面：整页只输出外壳，列表/分面/保存视图/选中详情全部由
// WalletsConsoleLoader 在浏览器里请求 /api/wallets/page-data（该接口有 KV 缓存）。
// 这样服务端不再跑聚合查询 + 序列化 600+ 钱包，规避 Workers Free 10ms CPU 限制。
export default function WalletsPage() {
  return <WalletsConsoleLoader />;
}