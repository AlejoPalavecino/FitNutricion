# Contrato de cálculo y calendario

Comidas y pesajes usan fechas civiles locales (`YYYY-MM-DD`); instantes y temporizadores siguen en UTC. La aritmética de días no depende de horario estacional. No se inventan edades para entradas inválidas; el onboarding automático se limita a adultos.

La energía mostrada y persistida es la suma de macros redondeados. Si proteína y grasa exceden el presupuesto inicial, se avisa y se presenta la suma coherente. Esto no constituye validación clínica ni garantiza seguridad individual.

El motor adaptativo alinea pesajes e ingestas en la misma ventana, excluye futuro y exige días confirmados completos. Editar comidas invalida esa confirmación. La imputación puede seguir sesgada por subregistro, hidratación y otros factores; no es medición directa del metabolismo.

Hay una revisión por semana iniciada el lunes, con ID estable por período. Los conflictos multidispositivo requieren elección explícita. TypeScript es la fuente canónica de metas energéticas; se retiraron permisos del RPC divergente. La vista SQL de 1RM replica Brzycki/Epley con pruebas de paridad. La progresión requiere todas las series de trabajo prescritas y sigue siendo una sugerencia, no una prescripción.

Las pruebas cubren calendario, valores inválidos, períodos desalineados, futuro, días parciales, coherencia energética, check-ins repetidos y rutinas incompletas. La revisión clínica y la aceptación en entorno real quedan pendientes.
