# 00 — BRIEF DE PRODUCTO

> Fixture del harness de pruebas. Recorte de una ejecucion real de la fase de
> producto, usado para poblar la interfaz sin llamar a Claude.

**Nombre de trabajo:** Tarea
**Fase:** Producto (previa a arquitectura)
**Estado:** Contrato de alcance.

## 1. El producto en una frase

Tarea es una lista de tareas personal, sin equipos ni proyectos, en la que apuntas
algo en dos segundos, le pones una etiqueta y lo vuelves a encontrar buscando.

## 2. Problema y usuario objetivo

**Usuario objetivo:** persona con trabajo de conocimiento que gestiona entre 30 y 300
tareas vivas de varios ambitos a la vez.

El dolor concreto:

1. Las herramientas grandes le cobran complejidad. Exigen decidir proyecto, estado y
   vista antes de poder escribir "llamar al gestor".
2. Las herramientas simples pierden la informacion. A los dos meses hay 400 lineas y
   no hay forma de responder a "que tenia pendiente del cliente Nogueira?".
3. El resultado es desconfianza. Cuando el usuario no se fia de que su lista este
   completa, deja de consultarla y el producto muere.

## 3. Alcance del MVP

### 3.1 — Captura y gestion de tareas

Un unico campo de texto siempre visible. El usuario escribe el titulo y pulsa Enter:
la tarea queda creada al instante y el campo se vacia listo para la siguiente.

**Criterio de aceptacion:** desde la lista cargada, escribir un titulo y pulsar Enter
crea la tarea, la muestra y deja el campo vacio y enfocado, sin recarga de pagina.

### 3.2 — Etiquetas

Cada tarea admite entre cero y cinco etiquetas de texto libre.

### 3.3 — Busqueda

Un campo de busqueda filtra por titulo, nota y etiqueta en menos de 100 ms.

## 4. Fuera del MVP

Colaboracion, subtareas, recurrencia, adjuntos, aplicacion movil nativa.

## 5. Monetizacion

4 EUR al mes o 40 EUR al ano, con prueba de 14 dias sin tarjeta.
