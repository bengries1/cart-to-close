"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    amazonMarketplaces: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const subject = encodeURIComponent(
      `New Cart To Close sign-up: ${formData.company || formData.name}`,
    );
    const body = encodeURIComponent(
      [
        `Name: ${formData.name}`,
        `Company: ${formData.company}`,
        `Email: ${formData.email}`,
        `Amazon Marketplaces: ${formData.amazonMarketplaces || "Not specified"}`,
        formData.message ? `\nMessage:\n${formData.message}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    window.location.href = `mailto:support@carttoclose.com?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Cart To Close
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Already have an account? Sign In
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6 py-16">
        {submitted ? (
          <div className="rounded-lg bg-white p-8 shadow text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Thanks for your interest!
            </h1>
            <p className="mt-3 text-gray-600">
              Your email client should have opened with a pre-filled message. Go
              ahead and send it, and we&apos;ll be in touch within one business
              day to get you set up.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Didn&apos;t see your email client open? Send us an email directly
              at{" "}
              <a
                href="mailto:support@carttoclose.com"
                className="font-medium text-blue-600 hover:text-blue-800"
              >
                support@carttoclose.com
              </a>
            </p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              &larr; Back to home
            </Link>
          </div>
        ) : (
          <div className="rounded-lg bg-white p-8 shadow">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                Get Started with Cart To Close
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Fill out the form below and we&apos;ll have your account set up
                within one business day.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jane Smith"
                />
              </div>

              <div>
                <label
                  htmlFor="company"
                  className="block text-sm font-medium text-gray-700"
                >
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  required
                  value={formData.company}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Corp"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Work Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jane@acmecorp.com"
                />
              </div>

              <div>
                <label
                  htmlFor="amazonMarketplaces"
                  className="block text-sm font-medium text-gray-700"
                >
                  Amazon Marketplaces
                </label>
                <select
                  id="amazonMarketplaces"
                  name="amazonMarketplaces"
                  value={formData.amazonMarketplaces}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  <option value="1">1</option>
                  <option value="2-5">2 - 5</option>
                  <option value="6-10">6 - 10</option>
                  <option value="10+">10+</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-sm font-medium text-gray-700"
                >
                  Anything else we should know?
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  value={formData.message}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="E.g. current order volume, NetSuite edition, timeline..."
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Create Account
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-gray-500">
              By signing up you agree to our terms of service and privacy policy.
            </p>
          </div>
        )}
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
