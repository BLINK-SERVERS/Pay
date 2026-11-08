import {
  BlinkSymbol,
  type NombreSimbolo,
  type Props as BlinkSymbolProps,
} from "./ui/BlinkSymbol";

/**
 * Alias histórico de los nombres usados por la interfaz.
 * La geometría ya no vive aquí: cada nombre apunta a un símbolo
 * oficial de SF Symbols a través de `BlinkSymbol`.
 */
export type IconName = NombreSimbolo;

type Props = Omit<BlinkSymbolProps, "nombre"> & {
  name: IconName;
};

export function Icon({ name, ...resto }: Props) {
  return <BlinkSymbol nombre={name} {...resto} />;
}
