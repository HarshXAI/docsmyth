interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state">
      <div className="error-state__icon">⚠️</div>
      <h3 className="error-state__title">{title}</h3>
      <p className="error-state__message">{message}</p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}
