export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="space-y-10">
          <header className="space-y-4">
            <h1 className="text-3xl font-bold">Time Tracker Reports</h1>
            <p className="text-slate-400">Welcome to the reports dashboard</p>
          </header>

          <section className="rounded-xl bg-slate-800 p-6 shadow">
            <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
            <p className="text-slate-300 mb-4">
              To view reports, navigate to the reports page for a specific user.
            </p>
            <p className="text-slate-400 text-sm">
              Example: <code className="bg-slate-700 px-2 py-1 rounded">/reports/user@example.com</code>
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-800 p-6 shadow">
              <h3 className="text-lg font-semibold mb-2">Templates</h3>
              <p className="text-slate-400 mb-4 text-sm">
                Looking for a starting point or more instructions?
              </p>
              <a
                href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm font-medium"
              >
                View Templates
              </a>
            </div>

            <div className="rounded-xl bg-slate-800 p-6 shadow">
              <h3 className="text-lg font-semibold mb-2">Documentation</h3>
              <p className="text-slate-400 mb-4 text-sm">
                Learn more about Next.js features and API.
              </p>
              <a
                href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm font-medium"
              >
                Read Docs
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
