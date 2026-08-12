import Button, { type ButtonProps } from "./Button";

export default function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="secondary" {...props} />;
}
