import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "تنگه هرمز: فرمانروایی آب‌های آزاد",
  description: "بازی تایکون نفتی و دفاع برجی دریایی در تنگه هرمز",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="bg-black text-white antialiased overflow-hidden">{children}</body>
    </html>
  );
}
