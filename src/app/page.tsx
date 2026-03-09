import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold text-gray-900">Cart To Close</span>
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-blue-600">
          Built by accountants, for accountants
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Amazon to NetSuite,{" "}
          <span className="text-blue-600">automated</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
          Cart To Close bridges the gap between Amazon Seller Central and
          NetSuite. Import settlement reports, sync orders and shipments, and
          reconcile every fee — so your books close faster and with fewer errors.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Get Started
          </Link>
          <a
            href="#features"
            className="text-sm font-semibold text-gray-700 hover:text-gray-900"
          >
            See how it works &darr;
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-gray-100 bg-gray-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            Everything you need to close the loop
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-gray-600">
            From the moment a customer clicks &ldquo;Buy&rdquo; to the moment
            your books are closed, Cart To Close keeps Amazon and NetSuite in
            sync.
          </p>

          <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              title="Settlement Reports"
              description="Import Amazon settlement flat files, save them to your account, and automatically discover new fee types that need GL mapping."
            />
            <FeatureCard
              title="Order Sync"
              description="Upload Amazon All Orders reports and sync them to NetSuite as Sales Orders — capturing every line item, SKU, and price."
            />
            <FeatureCard
              title="Shipment Sync"
              description="Upload Amazon FBA Shipment reports and sync them to NetSuite as Invoices, recording revenue when goods actually ship."
            />
            <FeatureCard
              title="Fee Reconciliation"
              description="Every Amazon fee type — commissions, FBA fees, promotions, tax — is mapped to a NetSuite GL account for accurate P&L reporting."
            />
            <FeatureCard
              title="Item Mapping"
              description="Map Amazon SKUs to NetSuite inventory items so every line item lands on the right record, automatically."
            />
            <FeatureCard
              title="Multi-Org Support"
              description="Run multiple Amazon seller accounts and NetSuite subsidiaries from a single dashboard with team-based access controls."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            How it works
          </h2>
          <div className="mt-12 space-y-10">
            <Step
              number="1"
              title="Connect your accounts"
              description="Link your Amazon Seller Central and NetSuite accounts with secure OAuth credentials. Your data never leaves your control."
            />
            <Step
              number="2"
              title="Configure your mappings"
              description="Map Amazon SKUs to NetSuite items, fees to GL accounts, and set default customers, subsidiaries, and tax codes."
            />
            <Step
              number="3"
              title="Upload & sync"
              description="Upload Amazon report files, preview the data, and sync to NetSuite with a single click. Track every sync job and review results."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-100 bg-blue-600 py-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Ready to automate your Amazon accounting?
          </h2>
          <p className="mt-4 text-blue-100">
            Cart To Close is currently available by invitation. Sign in or
            contact us to get started.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Cart To Close. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
        {number}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}
