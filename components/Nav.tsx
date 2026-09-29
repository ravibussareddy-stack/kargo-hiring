"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const link = (href: string, label: string) => (
    <Link href={href} className={path === href ? "on" : ""}>{label}</Link>
  );
  return (
    <nav>
      <b>Kargo<span className="hide-sm">&nbsp;Hiring</span></b>
      {link("/", "Dashboard")}
      {link("/interviews", "Interviews")}
      {link("/upload", "Upload CVs")}
      {link("/rubric", "Rubric")}
    </nav>
  );
}
