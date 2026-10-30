/** Erros da coleta, com a mensagem pronta para mostrar na tela. */
export type IgErrorKind = "blocked" | "notfound" | "network" | "format";
export class IgError extends Error {
  constructor(public kind: IgErrorKind, message: string) {
    super(message);
  }
}
