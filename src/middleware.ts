import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public routes that never require an authenticated Clerk session.
const isPublic = createRouteMatcher([
  "/",
  "/login(.*)",
  "/sign-up(.*)",
  "/invite/(.*)",
  "/api/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return NextResponse.next();
  const { userId } = await auth();
  if (!userId) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next internals and static files; run on everything else + API.
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
