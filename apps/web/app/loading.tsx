export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="page-loading__eyebrow">正在切换页面</div>
      <div className="page-loading__title" />
      <div className="page-loading__grid">
        <div className="page-loading__card" />
        <div className="page-loading__card" />
        <div className="page-loading__card" />
      </div>
      <div className="page-loading__panel" />
    </div>
  );
}
