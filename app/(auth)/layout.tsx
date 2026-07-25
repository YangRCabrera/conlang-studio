/**
 * Shared centering shell for /sign-in and /sign-up — Clerk's <SignIn>/<SignUp>
 * render their own card, this just places it on the page.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex flex-1 items-center justify-center p-6"
    >
      {children}
    </main>
  );
}
