import { Link } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-300/30">
        <div className="mx-auto flex justify-center">
          <BrandMark size="lg" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          The page you are looking for is not part of the current BMIS
          workspace.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-900"
        >
          Return to dashboard
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
