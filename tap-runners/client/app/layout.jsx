import "./globals.css";

export const metadata = {
  title: "Tap Runners — Race your rhythm",
  description: "A colorful multiplayer tap-racing game. Make every tap count.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
