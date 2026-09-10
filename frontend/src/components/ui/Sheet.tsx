import Modal from "./Modal";
import type { ComponentProps } from "react";

/**
 * A bottom sheet. A preset over Modal, following the same idiom as
 * PrimaryButton -> Button, so it inherits the focus trap, focus restore,
 * counted scroll lock and Escape handling rather than reimplementing them.
 *
 * `size` is not accepted: a sheet is always full width.
 */
export default function Sheet(
  props: Omit<ComponentProps<typeof Modal>, "placement" | "size">,
) {
  return <Modal {...props} placement="sheet" />;
}
