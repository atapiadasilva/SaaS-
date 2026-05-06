"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2,
  FolderTree,
  LogOut,
  Briefcase,
  Users,
  UserCircle,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// org-scoped items (prefixed with orgSlug)
const ORG_NAV_ITEMS = [
  { icon: Building2, label: "Organización", href: "/dashboard"  },
  { icon: FolderTree, label: "Proyectos",   href: "/proyectos"  },
  { icon: Users,      label: "Equipo",      href: "/miembros"   },
];

// global items (absolute paths)
const GLOBAL_NAV_ITEMS = [
  { icon: Briefcase, label: "Mis Empresas", href: "/organizaciones" },
];

function OrgLogo({ logoUrl, orgName, showText }: { logoUrl: string | null; orgName: string; showText: boolean }) {
  if (logoUrl) {
    return (
      <div className="flex items-center justify-center overflow-hidden">
        <img
          src={logoUrl}
          alt={orgName}
          style={{ maxHeight: 40, maxWidth: showText ? 160 : 40, objectFit: "contain", transition: "all 0.2s" }}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center overflow-hidden">
      <Image
        src="/logo-eimisa.png"
        alt="EIMISA"
        width={showText ? 160 : 40}
        height={40}
        className="object-contain transition-all duration-200"
        style={{ maxHeight: 40 }}
      />
    </div>
  );
}

export function PremiumSidebar({ orgSlug, orgLogoUrl, orgName, orgRole }: { orgSlug: string; orgLogoUrl?: string | null; orgName?: string; orgRole?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  return (
    <motion.div
      initial={{ width: 68 }}
      animate={{ width: isHovered ? 240 : 68 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-screen bg-white border-r border-border flex flex-col justify-between shadow-sm sticky top-0 left-0 z-50 overflow-hidden"
    >
      <div>
        {/* Logo */}
        <div className="h-20 flex items-center px-4 border-b border-border">
          <OrgLogo logoUrl={orgLogoUrl ?? null} orgName={orgName ?? orgSlug} showText={isHovered} />
        </div>

        {/* Org slug + role badge */}
        {isHovered && (
          <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold truncate">
              {orgSlug}
            </p>
            {orgRole && (
              <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${
                orgRole === 'owner'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {orgRole === 'owner' ? 'Owner' : 'Admin'}
              </span>
            )}
          </div>
        )}

        <nav className="p-3 space-y-1 mt-3">
          {orgRole === 'owner' && (
            <>
              {GLOBAL_NAV_ITEMS.map((item, idx) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={`global-${idx}`}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-muted transition-colors group",
                      isActive && "bg-primary/10 text-primary border-l-2 border-primary"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors",
                        isActive && "text-primary"
                      )}
                    />
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: isHovered ? 1 : 0 }}
                      className="whitespace-nowrap font-medium text-sm"
                    >
                      {item.label}
                    </motion.span>
                  </Link>
                );
              })}

              {/* Separador */}
              <div className="my-2 mx-3 border-t border-border/50" />
            </>
          )}

          {ORG_NAV_ITEMS.map((item, idx) => {
            const href = `/${orgSlug}${item.href}`;
            const isActive = pathname === href;
            return (
              <Link
                key={`org-${idx}`}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-muted transition-colors group",
                  isActive && "bg-primary/10 text-primary border-l-2 border-primary"
                )}
              >
                <item.icon
                  className={cn(
                    "w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors",
                    isActive && "text-primary"
                  )}
                />
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHovered ? 1 : 0 }}
                  className="whitespace-nowrap font-medium text-sm"
                >
                  {item.label}
                </motion.span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-border space-y-1">
        <Link
          href="/perfil"
          className={cn(
            "flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-muted transition-colors group",
            pathname === "/perfil" && "bg-primary/10 text-primary border-l-2 border-primary"
          )}
        >
          <UserCircle className={cn(
            "w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors",
            pathname === "/perfil" && "text-primary"
          )} />
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0 }}
            className="whitespace-nowrap font-medium text-sm"
          >
            Mi Perfil
          </motion.span>
        </Link>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-3 px-3 py-3 w-full rounded-lg text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors group disabled:opacity-60"
        >
          <LogOut className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-destructive transition-colors" />
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0 }}
            className="whitespace-nowrap font-medium text-sm"
          >
            {loggingOut ? "Cerrando..." : "Cerrar Sesión"}
          </motion.span>
        </button>
      </div>
    </motion.div>
  );
}
