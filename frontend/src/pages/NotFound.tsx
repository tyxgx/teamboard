import { Link } from "react-router-dom";

const NotFound = () => (
  <div className="flex h-screen items-center justify-center bg-slate-100 px-6">
    <div className="max-w-md text-center">
      <p className="font-mono text-sm text-emerald-600">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">This page doesn&apos;t exist</h1>
      <p className="mt-2 text-sm text-slate-600">The link may be broken, or the board may have been deleted.</p>
      <Link
        to="/app"
        className="mt-6 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
      >
        Back to your boards
      </Link>
    </div>
  </div>
);

export default NotFound;
