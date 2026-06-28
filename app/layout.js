import "./globals.css";
import Navbar from "./components/Navbar";

export const metadata = {
  title: "Quorum Investment Research Committee",
  description: "Dynamic multi-agent financial consensus engine. Real-time data streams, evidence-locked committee debate, and institutional investment verdicts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="text-slate-100 min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-16 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
