# Sibelga

Siga su consumo de gas y electricidad y el estado de la red de Sibelga
(Región de Bruselas-Capital) en Gladys Assistant.

Esta integración no está publicada por Sibelga. Sibelga no ofrece una API
pública: la integración lee las mismas páginas web que usted puede abrir en
su navegador — el portal «Mi consumo» con su propia cuenta y la página
pública de averías en curso. Si Sibelga las cambia, la integración puede
dejar de funcionar hasta que se actualice.

## Qué obtiene

- Un dispositivo por cada contador de su cuenta Sibelga (electricidad y gas),
  con su consumo diario, el consumo del último día y del último mes, y los
  índices del contador.
- Un dispositivo **Sibelga grid** (red Sibelga) que cuenta las averías en
  curso, en Bruselas y en sus municipios.
- Disparadores y acciones de escena, y dos widgets para el panel.

## Antes de empezar

Los datos de consumo requieren:

1. una cuenta de consumo de Sibelga: créela en
   [conso.sibelga.be](https://conso.sibelga.be/) (es la cuenta de la
   aplicación My Sibelga, no la de las solicitudes de obras);
2. sus contadores añadidos a esa cuenta con su código EAN;
3. un **contador inteligente** con la **lectura remota** autorizada: sin
   ella, Sibelga no tiene datos diarios que mostrar, y el contador solo
   recibe los valores que Sibelga conoce.

Inicie sesión una vez en el portal y compruebe que ve allí su consumo: la
integración muestra los mismos datos, nada más.

El estado de la red no necesita cuenta.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **correo electrónico** y la **contraseña** de su cuenta de
   consumo de Sibelga y guarde.
3. Pulse **Probar la cuenta Sibelga**: la integración inicia sesión y lista
   los contadores encontrados.
4. Abra la pestaña **Descubrimiento** y añada los dispositivos.

Otros ajustes:

- **Historial a importar** — días de consumo diario enviados a Gladys para
  cada contador (30 por defecto). El historial se envía cuando añade el
  dispositivo.
- **Actualización del consumo** — frecuencia de lectura del portal (cada 6
  horas por defecto). Sibelga publica las lecturas de un día al día
  siguiente: un intervalo más corto no aporta nada.
- **Seguir el estado de la red** — desactívelo si solo quiere el consumo.
- **Mis municipios** — los municipios cuyas averías le afectan. Déjelo vacío
  para seguir toda la región.
- **Actualización del estado de la red** — cada 15 minutos por defecto, cada
  5 minutos como máximo.

## Dispositivos

Cada contador lleva el nombre que usted le dio en el portal y su código EAN.

| Característica                    | Significado                                                      |
| --------------------------------- | ---------------------------------------------------------------- |
| Daily consumption                 | Un valor fechado por día, usado por las pantallas de energía     |
| Consumption of the last day       | Último día publicado por Sibelga (normalmente ayer)              |
| Consumption of the last month     | Tal como aparece en el portal                                    |
| Meter index (peak / off-peak)     | Últimos índices (horas punta / valle) de un contador inteligente |
| Injection of the last day, index… | Solo para un contador que también inyecta (paneles solares)      |

Todos los valores están en kWh, como en el portal. Los datos de un día llegan
al día siguiente: aquí no hay potencia en tiempo real. Para lecturas en
directo, use el puerto P1 de su contador inteligente con otra integración.

El dispositivo **Sibelga grid** tiene dos contadores: las averías en curso en
Bruselas y las de sus municipios.

Cada dispositivo lleva la insignia **cloud**: los datos llegan de Sibelga por
Internet. La insignia pasa a «inaccesible» cuando no se puede leer Sibelga.

## Acciones

Botones de la pestaña Configuración:

- **Probar la cuenta Sibelga** — inicia sesión y lista sus contadores.
- **Probar el estado de la red** — lee la página de averías y dice lo que
  muestra.
- **Actualizar los datos ahora** — lee ambas fuentes sin esperar.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior).

Disparadores:

- **Inicio de una avería de Sibelga** — ha aparecido una nueva avería. Filtre
  por _En mis municipios_ o _En otras zonas de Bruselas_; si se deja vacío,
  cualquier avería coincide. Variables: `{{triggerEvent.data.title}}`,
  `municipalities`, `url`, `count` (averías en curso en sus municipios) e
  `id`.
- **Fin de una avería de Sibelga** — una avería ya no aparece en la lista.
  Mismo filtro y mismas variables.
- **Nuevos datos de consumo de Sibelga** — Sibelga ha publicado un nuevo día
  para un contador. Filtre por contador o por energía. Variables:
  `consumption` e `injection` (kWh), `date`, `name`, `ean`.

Acciones:

- **Actualizar los datos de Sibelga** — lee Sibelga ahora. No la coloque en
  una escena iniciada por uno de los disparadores anteriores: una
  actualización puede activarlos.
- **Obtener un consumo de Sibelga** — consumo de un contador durante el
  último día, los últimos 7 o los últimos 30 días, para las acciones
  siguientes (por ejemplo, un mensaje con el consumo de ayer).
- **Obtener el estado de la red de Sibelga** — número de averías en curso y
  si sus municipios están afectados, para una condición o un mensaje.

Al iniciar Gladys, las averías ya en curso y las lecturas ya publicadas no
activan los disparadores: solo lo que cambie después.

## Panel

- **Consumo Sibelga** — elija un contador y un número de días: último día,
  último mes, media diaria y un gráfico de barras del consumo diario.
- **Estado de la red Sibelga** — averías en curso (sus municipios primero)
  con un enlace a su página en sibelga.be y un botón de actualización.

## Privacidad y límites

- Gladys guarda su contraseña en un campo secreto y solo se envía a la página
  de inicio de sesión de Sibelga. Nunca se escribe en los registros.
- La integración solo lee: nunca modifica nada en su cuenta Sibelga.
- Las averías se leen de una página web pública. Sibelga protege su sitio
  contra robots: cuando rechaza la integración, el estado muestra
  **Desconocido**, y la integración no intenta eludir la protección.
- No se siguen las interrupciones planificadas ni las obras.

## Solución de problemas

- **«Sibelga ha rechazado el correo electrónico o la contraseña»** — inicie
  sesión en [conso.sibelga.be](https://conso.sibelga.be/) con las mismas
  credenciales. La cuenta de solicitudes de obras es otra distinta.
- **«Sibelga did not complete the sign-in»** (en los registros) — el portal
  le está esperando: nuevas condiciones que aceptar o una dirección que
  confirmar. Inicie sesión una vez en un navegador y pulse **Probar la
  cuenta Sibelga**.
- **Ningún dispositivo, o sin consumo diario** — compruebe en el portal que
  el contador aparece, que es inteligente y que la lectura remota está
  autorizada. Los datos empiezan al día siguiente de la autorización.
- **Estado de la red «Desconocido»** — sibelga.be rechazó la petición o
  cambió su página. Las averías siguen visibles en el sitio de Sibelga.
- Para más detalles, lea los registros de la integración desde la interfaz
  de Gladys, con `LOG_LEVEL=debug` para verlo todo.
