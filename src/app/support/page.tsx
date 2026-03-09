import Link from "next/link";

export const metadata = {
  title: "Support — Cart To Close",
  description: "Get help with Cart To Close. Contact our team for technical support, account questions, or feature requests.",
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Cart To Close
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900">Support</h1>
        <p className="mt-4 text-gray-600">
          We&apos;re here to help. If you have questions about Cart To Close or
          need assistance with your account, reach out using any of the options
          below.
        </p>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {/* Email Support */}
          <div className="rounded-lg border border-gray-200 p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Email Support</h3>
            <p className="mt-2 text-sm text-gray-600">
              Send us an email and we&apos;ll get back to you within one
              business day.
            </p>
            <a
              href="mailto:support@carttoclose.com"
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              support@carttoclose.com
            </a>
          </div>

          {/* Getting Started */}
          <div className="rounded-lg border border-gray-200 p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Getting Started</h3>
            <p className="mt-2 text-sm text-gray-600">
              New to Cart To Close? Here&apos;s how to set up your account and
              start syncing.
            </p>
            <Link
              href="/#features"
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              View features overview
            </Link>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16">
          <h2 className="text-xl font-bold text-gray-900">
            Frequently Asked Questions
          </h2>

          <div className="mt-6 space-y-6">
            <FaqItem
              question="How do I connect my Amazon Seller Central account?"
              answer="Navigate to Settings > Amazon Connection in the dashboard. You'll need to authorize Cart To Close through Amazon's OAuth flow. Once authorized, you can start importing reports."
            />
            <FaqItem
              question="How do I connect my NetSuite account?"
              answer="Go to Settings > NetSuite Connection. You'll need your NetSuite Account ID and OAuth 1.0a Token-Based Authentication credentials (consumer key/secret, token ID/secret). These are created in NetSuite under Setup > Integration > Manage Integrations."
            />
            <FaqItem
              question="What Amazon report types are supported?"
              answer="Cart To Close supports Settlement Reports (V2 flat file), All Orders reports, and Amazon Fulfilled Shipments reports. All are uploaded as tab-delimited flat files from Seller Central."
            />
            <FaqItem
              question="How does fee mapping work?"
              answer="When you import a settlement report, Cart To Close automatically detects all fee types (commissions, FBA fees, etc.) and lets you map each one to a NetSuite GL account. New fee types are flagged so nothing goes unmapped."
            />
            <FaqItem
              question="Can I sync orders as Sales Orders and shipments as Invoices?"
              answer="Yes. Upload an All Orders report to create Sales Orders in NetSuite (when the customer places the order), and upload an FBA Shipments report to create Invoices (when the order ships). Item SKUs are mapped to NetSuite items automatically."
            />
            <FaqItem
              question="How do I invite team members?"
              answer="Organization owners can invite team members from Settings > Organization. Each invite is sent via email with a secure link that expires after 7 days."
            />
          </div>
        </div>

        {/* Contact CTA */}
        <div className="mt-16 rounded-lg bg-gray-50 border border-gray-200 p-8 text-center">
          <h3 className="text-lg font-semibold text-gray-900">
            Still need help?
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Our team is available Monday through Friday, 9am&ndash;6pm ET.
          </p>
          <a
            href="mailto:support@carttoclose.com"
            className="mt-4 inline-block rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Contact Support
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Cart To Close. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="border-b border-gray-100 pb-6">
      <h3 className="font-semibold text-gray-900">{question}</h3>
      <p className="mt-2 text-sm text-gray-600">{answer}</p>
    </div>
  );
}
