import "./globals.css";

export const metadata = {
  title: "Tap Runners — Race your rhythm",
  description: "A neon multiplayer tap-racing game. Make every tap count.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
