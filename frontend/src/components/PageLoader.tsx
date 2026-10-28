import { BrandMark } from './BrandMark';
import { Spinner } from './Spinner';

export function PageLoader() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-100 px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <BrandMark size="lg" />
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <Spinner className="h-5 w-5 text-brand-600" />
        Preparing your workspace...
      </div>
    </div>
  );
}
