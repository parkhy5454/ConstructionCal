import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ConCal — 전기공사 적산기",
    short_name: "ConCal",
    description: "자재단가DB × 표준품셈DB 자동 결합 전기공사 적산 프로그램",
    start_url: "/app/home",
    display: "standalone",
    background_color: "#101814",
    theme_color: "#1f6f54",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
