import Button, { type ButtonProps } from "./Button";

/**
 * Preset over Button, following the same idiom as
 * LogoutConfirmationModal -> ConfirmationModal.
 */
export default function PrimaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="primary" {...props} />;
}
