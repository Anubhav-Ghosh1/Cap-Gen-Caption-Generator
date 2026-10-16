import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  applicationName: "CaptionAI",
  title: "CaptionAI — Auto Captions for Videos",
  description:
    "Upload a video, transcribe it with a local AI model, pick a caption style, and export with subtitles burned in.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CaptionAI",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
