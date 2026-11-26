import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Growth Center: Sponsorship",
  description: "Sponsorship command center: funnel analytics, campaigns, tasks, payments and an AI copilot.",
};

const themeScript = `try{if(localStorage.getItem('gc-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased">{children}</body>
    </html>
  );
}
