import { Component, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  children: ReactNode;
}

interface Estado {
  cayó: boolean;
}

/**
 * Última red antes de la pantalla en blanco. Cada pestaña de la app es un
 * `lazy()` aparte: si el chunk no se baja —el botón «Actualizar» sin red, un
 * despliegue a medias, el navegador que tira la copia vieja—, la promesa
 * rechazada se queda memorizada en el propio `lazy` y remontar no la reintenta.
 * Por eso el único remedio honesto que se ofrece es recargar la página.
 */
export class ContencionError extends Component<Props, Estado> {
  state: Estado = { cayó: false };

  static getDerivedStateFromError(): Estado {
    return { cayó: true };
  }

  componentDidCatch(error: unknown): void {
    // Se deja en consola para el diagnóstico; el pasajero ve la tarjeta.
    console.error("Blink Pay no pudo cargar esta parte de la app", error);
  }

  render(): ReactNode {
    if (!this.state.cayó) return this.props.children;

    return (
      <div className="app">
        <main className="app__main" id="contenido">
          <div className="aviso aviso--peligro" role="alert">
            <Icon name="alerta" />
            <p>
              Blink Pay no pudo cargar esta parte de la app. Suele pasar cuando
              la versión se actualizó a media descarga o cuando el teléfono se
              quedó sin red.
            </p>
            <button
              type="button"
              className="boton boton--primario boton--compacto"
              onClick={() => window.location.reload()}
            >
              <Icon name="actualizar" />
              Volver a intentarlo
            </button>
          </div>
        </main>
      </div>
    );
  }
}
