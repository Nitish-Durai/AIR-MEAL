"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useRef, ReactNode } from "react";

export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [displayChildren, setDisplayChildren] = useState<ReactNode>(children);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Keep a ref to the latest children to avoid stale closure during navigation
  const childrenRef = useRef(children);
  useEffect(() => {
    childrenRef.current = children;
  }, [children]);

  useEffect(() => {
    if (pathname !== prevPathname) {
      // 1. Pathname changed! Start transition fade-out
      setIsTransitioning(true);
      setPrevPathname(pathname);

      // 2. Wait for fade-out to finish, then switch to the latest page content and fade-in
      const tOut = setTimeout(() => {
        setDisplayChildren(childrenRef.current);
        setIsTransitioning(false);
      }, 220); // matches style transition duration (220ms)

      return () => clearTimeout(tOut);
    } else {
      // Pathname didn't change (e.g. internal state changes within the same page)
      // Keep UI reactive by updating immediately if not in route transition
      if (!isTransitioning) {
        setDisplayChildren(children);
      }
    }
  }, [pathname, children, prevPathname, isTransitioning]);

  return (
    <div
      style={{
        opacity: isTransitioning ? 0 : 1,
        transform: isTransitioning ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {displayChildren}
    </div>
  );
}
