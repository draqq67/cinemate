export default function ErrorState({ title = 'Something went wrong', sub, onRetry }) {
  return (
    <div className="error-state">
      <div className="error-state__icon">⚠</div>
      <div className="error-state__title">{title}</div>
      {sub && <div className="error-state__sub">{sub}</div>}
      {onRetry && (
        <button className="error-state__retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
