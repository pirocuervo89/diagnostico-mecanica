# Taller de agentes de Maya

Maya puede encolar órdenes de arreglo, pero **la web nunca ejecuta comandos**.
Solo un administrador puede crear la orden; un worker que corre en tu máquina
(con el repositorio y OpenCode) la recoge, la ejecuta, pasa las pruebas y hace
commit/push.

## 1. Configurar el servidor

En Render (o en tu `.env`) añade:

```env
MAYA_AGENT_TOKEN=<cadena aleatoria de al menos 16 caracteres>
```

Genera una con:

```bash
openssl rand -hex 32
```

Sin ese token, la cola funciona pero el worker no puede recoger órdenes.

## 2. Arrancar el worker local

En la máquina donde está el repositorio y OpenCode:

```bash
MAYA_AGENT_URL=https://diagnostico-mecanica.onrender.com \
MAYA_AGENT_TOKEN=el-mismo-token-que-en-render \
node scripts/maya-agent-worker.mjs
```

Opciones:

- `MAYA_AGENT_REPO`: ruta del repositorio (por defecto, el directorio actual).
- `MAYA_AGENT_OPENCODE`: ruta al CLI de OpenCode (`opencode` por defecto).
- `MAYA_AGENT_MODEL`: modelo de OpenCode, por ejemplo `proveedor/modelo`.
- `MAYA_AGENT_PUSH=0`: hace commit pero no push.
- `MAYA_AGENT_TESTS=0`: no ejecuta `npm test` antes del commit (no recomendado).
- `MAYA_AGENT_ONCE=1`: procesa una orden y termina.

El worker exige que el repositorio no tenga cambios tracked sin commit. Así no
mezcla tu trabajo con el de Maya. `data/products.json` queda excluido del commit.

## 3. Usar el taller desde Maya

Inicia sesión con la cuenta administradora (el primer usuario registrado) y
escribe en el chat:

```text
agente: el botón de cambiar destino tapa el banner en 3D; arréglalo y comprueba el móvil
```

Para ver la cola:

```text
estado agentes
```

La respuesta indica el número de orden y si el worker está configurado. Cuando
termine, la orden pasa a `done` con el commit y si se subió, o a `error` con el
motivo (por ejemplo, pruebas fallidas).

## Qué hace el worker

1. Comprueba que el árbol de trabajo está limpio.
2. Ejecuta `opencode run --auto "<orden>"`.
3. Ejecuta `npm test`; si falla, **no** hace commit.
4. Hace `git add -A` excluyendo `data/products.json`, commit y `git push`.
5. Nunca usa `--force`, `reset` ni `stash`.

## Sobre Codebuff

La app no puede llamar a Codebuff como servicio: Codebuff no expone aquí un
endpoint al que Render pueda conectarse. El worker usa OpenCode, que sí tiene
CLI local. Para añadir otro agente, cambia `MAYA_AGENT_OPENCODE` por un
ejecutable con interfaz `run "<mensaje>"`, o adapta `scripts/maya-agent-worker.mjs`.

## Seguridad

- La cola está protegida por sesión de administrador; el worker por un token
  independiente que nunca se envía al navegador.
- El navegador no puede ejecutar git, shell ni OpenCode.
- Aun así, una orden de Maya puede modificar y subir código: usa una cuenta
  admin con contraseña fuerte y no compartas `MAYA_AGENT_TOKEN`.
