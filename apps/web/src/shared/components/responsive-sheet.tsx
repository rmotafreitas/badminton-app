import type { ReactNode } from "react";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { cn } from "@/shared/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/shared/ui/drawer";

/**
 * A dialog on desktop, a bottom sheet on phones: reachable with the thumb of the hand holding the phone, dismissed by
 * swiping down. `footer` stays pinned to the bottom (primary action in thumb reach) while the body scrolls.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <DrawerContent className={cn("max-h-[94svh]", className)}>
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle className="text-lg">{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
          {footer && <div className="border-t bg-background px-4 pt-3 pb-3">{footer}</div>}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[92svh] flex-col gap-0 p-0 sm:max-w-xl", className)}>
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
        {footer && <div className="border-t px-6 py-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
