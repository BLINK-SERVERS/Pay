import type { SVGProps } from "react";
import { BlinkSymbol, type NombreSimbolo } from "./ui/BlinkSymbol";

/**
 * Alias histórico de los nombres usados por la interfaz.
 * La geometría ya no vive aquí: cada nombre apunta a un símbolo
 * oficial de SF Symbols a través de `BlinkSymbol`.
 */
export type IconName = NombreSimbolo;

interface Props extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
}

export function Icon({ name, ...resto }: Props) {
  return <BlinkSymbol nombre={name} {...resto} />;
}
