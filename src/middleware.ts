import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // If user is authenticated but has no org, redirect to /onboarding
    // (unless they're already on /onboarding or an API route)
    if (
      token &&
      !token.organizationId &&
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/api/")
    ) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    // If user has an org and tries to visit /onboarding, redirect to dashboard
    if (token?.organizationId && pathname.startsWith("/onboarding")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/amazon/:path*",
    "/connections/:path*",
    "/mappings/:path*",
    "/reports/:path*",
    "/sync/:path*",
    "/settings/:path*",
    "/onboarding",
  ],
};
