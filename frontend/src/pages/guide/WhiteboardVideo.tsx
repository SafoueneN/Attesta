import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { ArrowBadge, Button, buttonClass, WITH_ARROW } from "../../components/ui";
import { frenchVoices, sentences, WhiteboardAudio, type AudioMix } from "./wbAudio";

/*
 * Vidéo explicative façon « whiteboard » : une main dessine au feutre l'histoire de Léa, du profil à la
 * veille. Ce n'est pas un fichier vidéo : c'est un dessin SVG piloté par une horloge unique (lecture, pause,
 * * déplacement et vitesse exacts), avec sous-titres, voix off, musique d'ambiance et bruitages (wbAudio.ts).
 *
 * Trois couches d'animation, toutes calculées à partir de l'horloge :
 * - le dessin : `wb-ink` (trait révélé le long du tracé), `wb-write` (écriture de gauche à droite) et
 *   `wb-pop` (aplat qui apparaît), avec `data-s` (départ) et `data-d` (durée), en secondes de scène ;
 * - le mouvement : `<Fx>` (flotter, se dandiner, s'envoler, trembler, cligner, saluer, tourner, compter…) ;
 * - la mise en scène : caméra (zooms et panoramiques par scène), secousses, coup d'éponge entre scènes.
 * Le contenu décrit le fonctionnement réel du produit.
 */

const INK = "#1d2a22";
const GREEN = "#2f8f4e";
const RED = "#d64545";
const AMBER = "#d9961a";
const LIME = "#e3f56b";
const W = 1280;
const H = 720;

/* ------------------------------------------------------------------------------------------------------ */
/* Primitives de dessin et de mouvement                                                                   */
/* ------------------------------------------------------------------------------------------------------ */

function Ink({
  p,
  at,
  dur = 0.7,
  w = 5,
  c = INK,
}: {
  p: string;
  at: number;
  dur?: number;
  w?: number;
  c?: string;
}) {
  return <path className="wb-ink" d={p} pathLength={1} data-s={at} data-d={dur} stroke={c} strokeWidth={w} />;
}

function Write({
  x,
  y,
  at,
  dur = 1,
  size = 44,
  c = INK,
  anchor = "start",
  children,
}: {
  x: number;
  y: number;
  at: number;
  dur?: number;
  size?: number;
  c?: string;
  anchor?: "start" | "middle";
  children: ReactNode;
}) {
  return (
    <text
      className="wb-write"
      x={x}
      y={y}
      data-s={at}
      data-d={dur}
      fill={c}
      fontSize={size}
      fontWeight={700}
      textAnchor={anchor}
    >
      {children}
    </text>
  );
}

function Pop({ at, dur = 0.4, children }: { at: number; dur?: number; children: ReactNode }) {
  return (
    <g className="wb-pop" data-s={at} data-d={dur}>
      {children}
    </g>
  );
}

type FxKind = "bob" | "wiggle" | "pulse" | "fly" | "flyout" | "shake" | "blink" | "wave" | "spin" | "count";

/**
 * Mouvement d'un groupe, à partir de `at` (secondes de scène) :
 * bob (flotte, axe `axis`), wiggle (se dandine), pulse (respire), fly (arrive depuis `from`), flyout (part
 * vers `to` et s'efface), shake (tremble à l'impact), blink (cligne), wave (salue autour de `origin`),
 * spin (tourne autour de `origin`), count (compte jusqu'à `value`).
 */
function Fx({
  kind,
  at = 0,
  dur = 1,
  amp = 1,
  freq = 1,
  axis = "y",
  from,
  to,
  origin,
  value,
  suffix = "",
  children,
}: {
  kind: FxKind;
  at?: number;
  dur?: number;
  amp?: number;
  freq?: number;
  axis?: "x" | "y";
  from?: [number, number];
  to?: [number, number];
  origin?: [number, number];
  value?: number;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <g
      data-fx={kind}
      data-fs={at}
      data-fd={dur}
      data-amp={amp}
      data-freq={freq}
      data-axis={axis}
      data-from={from?.join(" ")}
      data-to={to?.join(" ")}
      data-origin={origin?.join(" ")}
      data-value={value}
      data-suffix={suffix}
    >
      {children}
    </g>
  );
}

/** Feuille avec coin replié. */
const paper = (x: number, y: number, w: number, h: number) =>
  `M ${x} ${y} H ${x + w - 32} L ${x + w} ${y + 32} V ${y + h} H ${x} Z M ${x + w - 32} ${y} V ${y + 32} H ${x + w}`;
/** Coche. */
const check = (x: number, y: number, s = 36) =>
  `M ${x} ${y} L ${x + s * 0.35} ${y + s * 0.38} L ${x + s} ${y - s * 0.45}`;
/** Cercle (deux arcs, pour un tracé continu). */
const circle = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
/** Gribouillis d'emphase sous un mot. */
const scribble = (x1: number, x2: number, y: number) =>
  `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y + 22} ${x2} ${y - 4}`;

/** Léa : tête, cheveux, yeux qui clignent, bouche, puis corps ; bras qui saluent quand elle est contente. */
function Lea({ x, y, at, mood }: { x: number; y: number; at: number; mood: "inquiete" | "contente" }) {
  const r = 46;
  const shoulder: [number, number] = [x, y + r + 40];
  const mouth =
    mood === "contente"
      ? `M ${x - 18} ${y + 14} Q ${x} ${y + 34} ${x + 18} ${y + 14}`
      : `M ${x - 14} ${y + 24} Q ${x} ${y + 14} ${x + 14} ${y + 24}`;
  return (
    <Fx kind="bob" at={at + 3.4} amp={3} freq={0.7}>
      <Ink p={circle(x, y, r)} at={at} dur={0.8} />
      <Ink
        p={`M ${x - r - 4} ${y - 2} Q ${x - r + 4} ${y - r - 26} ${x} ${y - r - 10} Q ${x + r - 4} ${y - r - 26} ${x + r + 4} ${y - 2} M ${x + r} ${y - 14} Q ${x + r + 38} ${y + 6} ${x + r + 18} ${y + 52}`}
        at={at + 0.6}
        dur={0.7}
        w={6}
      />
      <Fx kind="blink" at={at + 1.3} origin={[x, y - 6]}>
        <Pop at={at + 1.2} dur={0.25}>
          <circle cx={x - 16} cy={y - 6} r={5} fill={INK} />
          <circle cx={x + 16} cy={y - 6} r={5} fill={INK} />
        </Pop>
      </Fx>
      <Ink p={mouth} at={at + 1.4} dur={0.35} />
      <Ink p={`M ${x} ${y + r} L ${x} ${y + r + 120}`} at={at + 1.8} dur={0.4} />
      {mood === "contente" ? (
        <Fx kind="wave" at={at + 3.2} dur={4} amp={9} freq={1.6} origin={shoulder}>
          <Ink
            p={`M ${x - 72} ${y + r - 14} L ${x} ${y + r + 40} L ${x + 72} ${y + r - 14}`}
            at={at + 2.2}
            dur={0.5}
          />
        </Fx>
      ) : (
        <Ink
          p={`M ${x - 60} ${y + r + 90} L ${x} ${y + r + 40} L ${x + 60} ${y + r + 90}`}
          at={at + 2.2}
          dur={0.5}
        />
      )}
      <Ink
        p={`M ${x - 40} ${y + r + 210} L ${x} ${y + r + 120} L ${x + 40} ${y + r + 210}`}
        at={at + 2.7}
        dur={0.5}
      />
    </Fx>
  );
}

/** Confettis : chaque éclat part du centre (cx, cy) et rejoint sa place en tournant. */
function Confetti({ cx, cy, at }: { cx: number; cy: number; at: number }) {
  const colors = [LIME, GREEN, AMBER, RED];
  return (
    <>
      {Array.from({ length: 26 }, (_, i) => {
        const angle = (i / 26) * Math.PI * 2;
        const dist = 170 + (i % 4) * 55;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist * 0.62;
        return (
          <Fx key={i} kind="fly" at={at + (i % 5) * 0.03} dur={0.9} from={[cx - x, cy - y]}>
            <Fx kind="spin" at={at} freq={0.6 + (i % 3) * 0.3} origin={[x + 6, y + 4]}>
              <rect x={x} y={y} width={12} height={8} rx={2} fill={colors[i % 4]} />
            </Fx>
          </Fx>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Les scènes                                                                                             */
/* ------------------------------------------------------------------------------------------------------ */

/** Plan de caméra : centre visé (x, y) et zoom z, atteint au temps `at` (secondes de scène). */
type Shot = { at: number; x: number; y: number; z: number };

interface Scene {
  chapter: string;
  duration: number;
  narration: string;
  camera: Shot[];
  /** Instants de secousse de l'image (impacts). */
  shakes?: number[];
  art: ReactNode;
}

const WIDE: Shot = { at: 0, x: 640, y: 360, z: 1 };

const SCENES: Scene[] = [
  {
    chapter: "Léa",
    duration: 8,
    narration: "Voici Léa. Elle cherche un emploi. Elle a un CV… mais chaque offre demande autre chose.",
    camera: [
      { at: 0, x: 330, y: 400, z: 1.45 },
      { at: 2.8, x: 330, y: 400, z: 1.3 },
      { at: 4.2, x: 640, y: 360, z: 1 },
      { at: 6.6, x: 900, y: 340, z: 1.12 },
    ],
    art: (
      <>
        <Write x={640} y={110} at={3.4} size={64} anchor="middle" dur={1.1}>
          Léa cherche un emploi…
        </Write>
        <Lea x={300} y={300} at={0.3} mood="inquiete" />
        <Ink p={paper(480, 290, 170, 220)} at={3.6} dur={0.7} />
        <Write x={530} y={370} at={4.2} size={52} dur={0.4}>
          CV
        </Write>
        <Ink p="M 500 420 H 620 M 500 455 H 600 M 500 490 H 610" at={4.5} dur={0.4} w={4} />
        <Ink p="M 670 380 Q 730 330 790 300 M 772 296 L 790 300 L 782 318" at={4.8} dur={0.35} w={4} />
        {[
          [800, 210],
          [960, 300],
          [1110, 210],
        ].map(([x, y], i) => (
          <Fx key={x} kind="bob" at={5.4} amp={6} freq={0.9 + i * 0.2}>
            <Ink p={paper(x!, y!, 130, 160)} at={5 + i * 0.3} dur={0.45} w={4} />
            <Fx kind="wiggle" at={6.4} amp={14} freq={2.2 + i * 0.4} origin={[x! + 65, y! + 85]}>
              <Write x={x! + 65} y={y! + 110} at={5.9 + i * 0.25} size={80} c={RED} anchor="middle" dur={0.3}>
                ?
              </Write>
            </Fx>
          </Fx>
        ))}
      </>
    ),
  },
  {
    chapter: "La tentation",
    duration: 8.5,
    narration: "La tentation : gonfler son CV. Mauvaise idée : en entretien, tout se vérifie.",
    camera: [
      WIDE,
      { at: 1.4, x: 610, y: 380, z: 1.28 },
      { at: 6.1, x: 610, y: 380, z: 1.28 },
      { at: 7, x: 820, y: 330, z: 1.08 },
    ],
    shakes: [5, 5.4, 5.8],
    art: (
      <>
        <Write x={640} y={100} at={0} size={60} anchor="middle">
          Gonfler son CV ?
        </Write>
        <Ink p={paper(380, 160, 460, 440)} at={0.6} dur={0.8} />
        <Write x={430} y={280} at={1.6} size={42} dur={0.8}>
          Expert Kubernetes
        </Write>
        <Write x={430} y={380} at={2.6} size={42} dur={0.8}>
          +60 % de performance
        </Write>
        <Write x={430} y={480} at={3.6} size={42} dur={0.8}>
          Chef d'une équipe de 15
        </Write>
        <Ink p="M 420 268 L 760 278" at={5} dur={0.25} w={8} c={RED} />
        <Ink p="M 420 368 L 800 372" at={5.4} dur={0.25} w={8} c={RED} />
        <Ink p="M 420 468 L 810 474" at={5.8} dur={0.25} w={8} c={RED} />
        <Fx kind="pulse" at={7.2} amp={0.04} freq={1.4}>
          <Ink
            p="M 880 210 H 1200 Q 1230 210 1230 240 V 340 Q 1230 370 1200 370 H 960 L 900 420 L 920 370 H 900 Q 870 370 870 340 V 240 Q 870 210 900 210"
            at={6.1}
            dur={0.6}
            w={4}
          />
          <Write x={1050} y={280} at={6.6} size={34} anchor="middle" dur={0.5}>
            Tout se vérifie
          </Write>
          <Write x={1050} y={330} at={7} size={34} anchor="middle" dur={0.5} c={RED}>
            en entretien !
          </Write>
        </Fx>
      </>
    ),
  },
  {
    chapter: "Attesta",
    duration: 7.5,
    narration: "Avec Attesta, Léa crée un CV ciblé pour chaque offre, sans jamais rien inventer.",
    camera: [
      { at: 0, x: 640, y: 230, z: 1.9 },
      { at: 1.4, x: 640, y: 240, z: 1.7 },
      { at: 2.6, x: 640, y: 390, z: 1 },
    ],
    shakes: [0.45],
    art: (
      <>
        <Fx kind="pulse" at={1.6} amp={0.035} freq={1.1}>
          <Pop at={0.3} dur={0.35}>
            <rect x={560} y={150} width={160} height={160} rx={38} fill={LIME} stroke={INK} strokeWidth={5} />
          </Pop>
          <Ink p="M 598 234 L 630 268 L 684 200" at={0.8} dur={0.45} w={14} />
        </Fx>
        <Write x={640} y={420} at={1.4} size={96} anchor="middle" dur={0.8}>
          Attesta
        </Write>
        <Write x={640} y={500} at={2.6} size={46} anchor="middle" dur={0.9}>
          Un CV ciblé pour chaque offre…
        </Write>
        <Write x={640} y={570} at={3.8} size={46} anchor="middle" c={GREEN} dur={0.9}>
          … sans jamais rien inventer.
        </Write>
        <Ink p={scribble(470, 810, 598)} at={5} dur={0.45} w={5} c={GREEN} />
        <Fx kind="spin" at={5.5} freq={0.25} origin={[470, 150]}>
          <Ink p="M 470 170 l 0 -40 M 450 150 l 40 0" at={5.4} dur={0.3} w={4} c={AMBER} />
        </Fx>
        <Fx kind="spin" at={5.7} freq={-0.3} origin={[830, 282]}>
          <Ink p="M 830 300 l 0 -36 M 812 282 l 36 0" at={5.6} dur={0.3} w={4} c={AMBER} />
        </Fx>
      </>
    ),
  },
  {
    chapter: "1. Le profil",
    duration: 9,
    narration:
      "Étape 1 : Léa saisit son profil, ou importe son CV en PDF. Ce profil devient sa seule source de vérité.",
    camera: [
      { at: 0, x: 400, y: 340, z: 1.25 },
      { at: 2.4, x: 630, y: 375, z: 1.22 },
      { at: 6.2, x: 640, y: 375, z: 1.05 },
      { at: 6.8, x: 980, y: 360, z: 1.2 },
      { at: 8.4, x: 640, y: 360, z: 1 },
    ],
    art: (
      <>
        <Write x={90} y={100} at={0} size={56} dur={0.8}>
          ① Le profil
        </Write>
        <Ink p={paper(110, 250, 130, 170)} at={0.6} dur={0.5} />
        <Write x={175} y={350} at={1.1} size={40} c={RED} anchor="middle" dur={0.4}>
          PDF
        </Write>
        {/* Une page s'envole du PDF vers la fiche profil. */}
        <Fx kind="flyout" at={1.9} dur={1} to={[340, 20]}>
          <Pop at={1.6} dur={0.25}>
            <rect x={150} y={280} width={60} height={80} rx={6} fill="#ffffff" stroke={INK} strokeWidth={3} />
          </Pop>
        </Fx>
        <Ink p="M 260 340 Q 330 300 400 340 M 384 324 L 400 340 L 380 352" at={1.8} dur={0.4} />
        <Ink p={paper(420, 180, 420, 390)} at={2.4} dur={0.7} />
        <Ink p={circle(495, 250, 32)} at={3} dur={0.4} />
        <Write x={545} y={262} at={3.3} size={38} dur={0.5}>
          Léa Martin
        </Write>
        <Write x={460} y={360} at={3.7} size={40} dur={0.6}>
          Expériences
        </Write>
        <Fx kind="pulse" at={4.6} amp={0.15} freq={1.5} origin={[778, 338]}>
          <Ink p={check(760, 345)} at={4.3} dur={0.25} w={7} c={GREEN} />
        </Fx>
        <Write x={460} y={430} at={4.5} size={40} dur={0.7}>
          Réalisations chiffrées
        </Write>
        <Fx kind="pulse" at={5.5} amp={0.15} freq={1.5} origin={[798, 408]}>
          <Ink p={check(780, 415)} at={5.2} dur={0.25} w={7} c={GREEN} />
        </Fx>
        <Write x={460} y={500} at={5.4} size={40} dur={0.6}>
          Compétences
        </Write>
        <Fx kind="pulse" at={6.3} amp={0.15} freq={1.5} origin={[778, 478]}>
          <Ink p={check(760, 485)} at={6} dur={0.25} w={7} c={GREEN} />
        </Fx>
        <Write x={1050} y={320} at={6.8} size={56} anchor="middle" c={GREEN} dur={0.7}>
          Seule source
        </Write>
        <Write x={1050} y={390} at={7.4} size={56} anchor="middle" c={GREEN} dur={0.6}>
          de vérité !
        </Write>
        <Ink p={scribble(920, 1180, 415)} at={8} dur={0.35} w={5} c={GREEN} />
      </>
    ),
  },
  {
    chapter: "2. L'offre",
    duration: 8.5,
    narration: "Étape 2 : elle colle l'annonce. Attesta repère les exigences et les mots-clés.",
    camera: [
      { at: 0, x: 520, y: 360, z: 1.15 },
      { at: 3.8, x: 470, y: 330, z: 1.55 },
      { at: 4.8, x: 470, y: 330, z: 1.55 },
      { at: 5.6, x: 760, y: 360, z: 1.1 },
      { at: 8, x: 640, y: 360, z: 1 },
    ],
    art: (
      <>
        <Write x={90} y={100} at={0} size={56} dur={0.8}>
          ② L'offre visée
        </Write>
        <Pop at={4.1} dur={0.35}>
          <rect x={325} y={300} width={290} height={52} rx={10} fill={LIME} opacity={0.8} />
        </Pop>
        <Ink p={paper(290, 160, 440, 450)} at={0.5} dur={0.7} />
        <Write x={330} y={250} at={1.1} size={42} dur={0.7}>
          Développeur back-end
        </Write>
        <Write x={330} y={340} at={1.8} size={42} dur={0.7}>
          Node.js, PostgreSQL
        </Write>
        <Write x={330} y={420} at={2.5} size={42} dur={0.6}>
          API REST, tests
        </Write>
        <Write x={330} y={500} at={3.1} size={38} c={AMBER} dur={0.6}>
          Kubernetes : un plus
        </Write>
        <Ink
          p="M 322 475 Q 300 505 340 528 Q 500 545 650 520 Q 690 495 660 470"
          at={4.5}
          dur={0.4}
          w={4}
          c={AMBER}
        />
        {/* La loupe balaie l'annonce de gauche à droite. */}
        <Fx kind="bob" at={6.4} amp={40} freq={0.45} axis="x">
          <Ink p={circle(920, 330, 95)} at={5.4} dur={0.5} w={7} />
          <Ink p="M 988 398 L 1080 490" at={5.9} dur={0.2} w={16} />
          <Write x={920} y={345} at={6.1} size={40} anchor="middle" dur={0.5}>
            mots-clés
          </Write>
        </Fx>
      </>
    ),
  },
  {
    chapter: "3. La génération",
    duration: 11,
    narration:
      "Étape 3 : Attesta choisit et reformule ses faits. Chaque ligne est contrôlée : sans source, elle est retirée. Un mot-clé absent est signalé, jamais ajouté.",
    camera: [
      WIDE,
      { at: 3.4, x: 790, y: 300, z: 1.45 },
      { at: 5.2, x: 790, y: 360, z: 1.4 },
      { at: 6.4, x: 760, y: 480, z: 1.45 },
      { at: 8, x: 1000, y: 470, z: 1.3 },
      { at: 10.2, x: 640, y: 380, z: 1 },
    ],
    shakes: [4.75, 7.3],
    art: (
      <>
        <Write x={90} y={100} at={0} size={56} dur={0.8}>
          ③ Un CV ciblé… et sourcé
        </Write>
        <Ink p={paper(90, 210, 240, 300)} at={0.5} dur={0.5} />
        <Write x={130} y={270} at={0.9} size={40} dur={0.4}>
          Profil
        </Write>
        <Ink p="M 120 320 H 290 M 120 360 H 270 M 120 400 H 280 M 120 440 H 250" at={1.2} dur={0.5} w={4} />
        <Fx kind="pulse" at={2.4} amp={0.06} freq={2} origin={[448, 345]}>
          <Ink p="M 350 360 Q 450 310 545 360 M 527 344 L 545 360 L 524 372" at={1.8} dur={0.4} w={6} />
        </Fx>
        <Write x={448} y={300} at={2.2} size={32} anchor="middle" dur={0.6}>
          choisit, reformule
        </Write>
        <Ink p={paper(570, 160, 440, 450)} at={2.6} dur={0.7} />
        <Write x={610} y={260} at={3.3} size={36} dur={0.8}>
          Réduction de 40 % du temps
        </Write>
        <Fx kind="fly" at={4.4} dur={0.35} from={[0, -140]}>
          <Pop at={4.4} dur={0.3}>
            <g transform="rotate(-10 905 310)">
              <rect
                x={830}
                y={285}
                width={150}
                height={52}
                rx={8}
                fill="none"
                stroke={GREEN}
                strokeWidth={5}
              />
              <text x={905} y={322} textAnchor="middle" fontSize={32} fontWeight={700} fill={GREEN}>
                SOURCÉ
              </text>
            </g>
          </Pop>
        </Fx>
        <Write x={610} y={390} at={5.1} size={36} dur={0.7}>
          Migration de 12 services
        </Write>
        <Fx kind="pulse" at={6.1} amp={0.18} freq={1.6} origin={[958, 371]}>
          <Ink p={check(940, 378)} at={5.8} dur={0.25} w={7} c={GREEN} />
        </Fx>
        <Write x={610} y={500} at={6.3} size={36} c={RED} dur={0.6}>
          Expert Kubernetes
        </Write>
        <Ink p="M 600 488 L 880 496" at={7.1} dur={0.2} w={8} c={RED} />
        <Write x={700} y={560} at={7.4} size={30} c={RED} dur={0.5}>
          retirée : sans source
        </Write>
        {/* Jauge de fidélité qui compte jusqu'à 100 %. */}
        <Ink p={circle(210, 590, 46)} at={8} dur={0.5} w={7} c={GREEN} />
        <Fx kind="count" at={8.3} dur={1.2} value={100} suffix=" %">
          <text x={210} y={602} textAnchor="middle" fontSize={34} fontWeight={700} fill={GREEN}>
            0 %
          </text>
        </Fx>
        <Write x={280} y={600} at={8.6} size={30} dur={0.4} c={GREEN}>
          fidélité
        </Write>
        <Fx kind="bob" at={9.9} amp={5} freq={1.2}>
          <Ink
            p="M 1040 400 H 1240 Q 1260 400 1260 420 V 560 Q 1260 580 1240 580 H 1060 Q 1040 580 1040 560 V 420 Q 1040 400 1060 400"
            at={7.9}
            dur={0.45}
            w={4}
            c={AMBER}
          />
          <Write x={1150} y={450} at={8.3} size={30} anchor="middle" dur={0.4}>
            Kubernetes :
          </Write>
          <Write x={1150} y={495} at={8.8} size={30} anchor="middle" c={AMBER} dur={0.4}>
            signalé,
          </Write>
          <Write x={1150} y={540} at={9.3} size={30} anchor="middle" c={AMBER} dur={0.5}>
            jamais ajouté
          </Write>
        </Fx>
      </>
    ),
  },
  {
    chapter: "4. Relecture et PDF",
    duration: 9.5,
    narration:
      "Étape 4 : Léa relit chaque ligne et sa source, puis télécharge son CV en PDF, lisible par les logiciels de recrutement.",
    camera: [
      { at: 0, x: 350, y: 380, z: 1.3 },
      { at: 2.8, x: 760, y: 320, z: 1.4 },
      { at: 4.8, x: 820, y: 470, z: 1.25 },
      { at: 8.6, x: 640, y: 360, z: 1 },
    ],
    art: (
      <>
        <Write x={90} y={100} at={0} size={56} dur={0.8}>
          ④ Relecture, puis PDF
        </Write>
        <Ink p={paper(160, 170, 340, 430)} at={0.5} dur={0.6} />
        <Ink
          p="M 200 250 H 440 M 200 310 H 420 M 200 370 H 450 M 200 430 H 400 M 200 490 H 430"
          at={1}
          dur={0.6}
          w={4}
        />
        {/* La loupe parcourt le CV de haut en bas. */}
        <Fx kind="bob" at={2.3} amp={70} freq={0.55}>
          <Ink p={circle(400, 330, 70)} at={1.6} dur={0.4} w={7} />
          <Ink p="M 450 380 L 520 450" at={2} dur={0.2} w={14} />
        </Fx>
        <Ink p="M 600 280 h 56 v 56 h -56 Z" at={3} dur={0.4} w={5} />
        <Fx kind="pulse" at={3.8} amp={0.2} freq={1.4} origin={[628, 305]}>
          <Ink p={check(610, 310, 44)} at={3.5} dur={0.25} w={8} c={GREEN} />
        </Fx>
        <Write x={680} y={325} at={3.8} size={46} dur={0.8}>
          J'ai relu mon CV
        </Write>
        <Ink p={paper(700, 400, 150, 190)} at={5} dur={0.5} />
        <Write x={775} y={510} at={5.5} size={44} c={RED} anchor="middle" dur={0.4}>
          PDF
        </Write>
        <Fx kind="bob" at={6.5} amp={10} freq={1.6}>
          <Ink p="M 930 420 V 560 M 905 535 L 930 560 L 955 535" at={6} dur={0.4} w={6} />
        </Fx>
        <Write x={990} y={500} at={6.6} size={40} c={GREEN} dur={0.8}>
          lisible par les ATS
        </Write>
        <Ink p={scribble(990, 1260, 520)} at={7.6} dur={0.35} w={5} c={GREEN} />
      </>
    ),
  },
  {
    chapter: "Avec un compte",
    duration: 10,
    narration:
      "Avec un compte, Léa rédige aussi une lettre de motivation contrôlée. Et chaque jour, les nouvelles offres arrivent à l'adresse de son choix.",
    camera: [
      { at: 0, x: 330, y: 380, z: 1.3 },
      { at: 2.8, x: 700, y: 370, z: 1.25 },
      { at: 4.6, x: 1040, y: 330, z: 1.3 },
      { at: 6.8, x: 640, y: 420, z: 1.05 },
    ],
    art: (
      <>
        <Write x={640} y={100} at={0} size={56} anchor="middle" dur={0.8}>
          Et avec un compte…
        </Write>
        <Fx kind="bob" at={2.4} amp={6} freq={1}>
          <Ink p="M 200 240 H 460 V 410 H 200 Z M 200 240 L 330 330 L 460 240" at={0.5} dur={0.8} />
        </Fx>
        <Write x={330} y={470} at={1.3} size={38} anchor="middle" dur={0.8}>
          Lettre de motivation
        </Write>
        <Write x={330} y={515} at={2.1} size={38} anchor="middle" c={GREEN} dur={0.5}>
          contrôlée
        </Write>
        <Ink p={circle(700, 320, 72)} at={2.8} dur={0.5} />
        <Fx kind="spin" at={3.6} freq={0.8} origin={[700, 320]}>
          <Ink p="M 700 320 V 270" at={3.3} dur={0.2} w={6} />
        </Fx>
        <Fx kind="spin" at={3.6} freq={0.12} origin={[700, 320]}>
          <Ink p="M 700 320 L 738 340" at={3.4} dur={0.2} w={6} />
        </Fx>
        <Write x={700} y={450} at={3.8} size={40} anchor="middle" dur={0.6}>
          Chaque jour
        </Write>
        <Fx kind="fly" at={4.6} dur={0.6} from={[260, -80]}>
          <Fx kind="pulse" at={6.4} amp={0.035} freq={1.2}>
            <Ink
              p="M 900 230 H 1180 Q 1210 230 1210 260 V 380 Q 1210 410 1180 410 H 960 L 920 450 L 930 410 H 900 Q 870 410 870 380 V 260 Q 870 230 900 230"
              at={4.7}
              dur={0.6}
              w={4}
            />
            <Write x={1040} y={300} at={5.3} size={36} anchor="middle" dur={0.6}>
              2 nouvelles offres
            </Write>
            <Write x={1040} y={355} at={5.9} size={36} anchor="middle" c={RED} dur={0.4}>
              + 2 PDF
            </Write>
          </Fx>
        </Fx>
        <Write x={640} y={600} at={6.8} size={46} anchor="middle" c={GREEN} dur={0.9}>
          à l'adresse de son choix
        </Write>
        <Ink p={scribble(430, 850, 625)} at={7.8} dur={0.4} w={5} c={GREEN} />
      </>
    ),
  },
  {
    chapter: "Le CV qui dit vrai",
    duration: 9,
    narration:
      "Un CV ciblé, sourcé ligne par ligne, et justifié par vos pièces si vous le souhaitez. Attesta : le CV qui dit vrai.",
    camera: [
      { at: 0, x: 280, y: 390, z: 1.4 },
      { at: 3.2, x: 640, y: 360, z: 1 },
      { at: 6.2, x: 950, y: 430, z: 1.15 },
    ],
    shakes: [6.45],
    art: (
      <>
        <Lea x={250} y={290} at={0.3} mood="contente" />
        <Fx kind="bob" at={4.6} amp={8} freq={0.9}>
          <Ink p={paper(420, 250, 180, 230)} at={3.2} dur={0.5} />
          <Ink p={check(450, 380, 110)} at={3.8} dur={0.35} w={12} c={GREEN} />
        </Fx>
        <Write x={950} y={250} at={4.2} size={62} anchor="middle" dur={0.8}>
          Un CV ciblé,
        </Write>
        <Write x={950} y={330} at={5} size={62} anchor="middle" c={GREEN} dur={0.9}>
          sourcé ligne par ligne.
        </Write>
        <Confetti cx={950} cy={448} at={6.5} />
        <Fx kind="pulse" at={7.2} amp={0.04} freq={1.3}>
          <Pop at={6.3} dur={0.3}>
            <rect x={770} y={400} width={360} height={96} rx={48} fill={LIME} stroke={INK} strokeWidth={4} />
          </Pop>
          <Write x={950} y={466} at={6.6} size={60} anchor="middle" dur={0.6}>
            Attesta
          </Write>
        </Fx>
        <Write x={950} y={580} at={7.4} size={44} anchor="middle" dur={0.8}>
          le CV qui dit vrai
        </Write>
      </>
    ),
  },
];

/** Début de chaque scène dans la vidéo (secondes). */
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((sum, s) => sum + s.duration, 0));
const TOTAL = STARTS.at(-1)! + SCENES.at(-1)!.duration;
/** Durée du coup d'éponge en fin de scène. */
const ERASE = 0.6;
const sceneAt = (t: number) => {
  let i = 0;
  while (i < SCENES.length - 1 && t >= STARTS[i + 1]!) i++;
  return i;
};
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p: number) => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);

/** Position de la caméra à l'instant `t` : interpolation douce entre les plans. */
function cameraAt(shots: Shot[], t: number) {
  const list = shots[0]!.at > 0 ? [WIDE, ...shots] : shots;
  if (t <= list[0]!.at) return list[0]!;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    if (t < b.at) {
      const p = easeInOut((t - a.at) / (b.at - a.at));
      return { at: t, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, z: a.z + (b.z - a.z) * p };
    }
  }
  return list.at(-1)!;
}

interface DrawItem {
  el: SVGGraphicsElement;
  kind: "ink" | "write" | "pop";
  s: number;
  d: number;
  length: number;
  box: DOMRect;
}

interface FxItem {
  el: SVGGElement;
  kind: FxKind;
  s: number;
  d: number;
  amp: number;
  freq: number;
  axis: string;
  from: number[];
  to: number[];
  value: number;
  suffix: string;
  text: SVGTextElement | null;
}

const nums = (v: string | undefined) => (v ? v.split(" ").map(Number) : []);

/** Transformation d'un mouvement à l'instant local `t` (secondes de scène). */
function fxStyle(f: FxItem, t: number): { transform?: string; opacity?: string } {
  const dt = t - f.s;
  const wave = (k = 1) => Math.sin(dt * f.freq * Math.PI * 2 * k);
  switch (f.kind) {
    case "bob":
      if (dt < 0) return {};
      return {
        transform: f.axis === "x" ? `translateX(${wave() * f.amp}px)` : `translateY(${wave() * f.amp}px)`,
      };
    case "wiggle":
      return dt < 0 ? {} : { transform: `rotate(${wave() * f.amp}deg)` };
    case "pulse":
      return dt < 0 ? {} : { transform: `scale(${1 + Math.abs(wave(0.5)) * f.amp})` };
    case "spin":
      return dt < 0 ? {} : { transform: `rotate(${dt * f.freq * 360}deg)` };
    case "wave": {
      if (dt < 0 || dt > f.d) return {};
      return { transform: `rotate(${wave() * f.amp * Math.sin((dt / f.d) * Math.PI)}deg)` };
    }
    case "shake": {
      if (dt < 0 || dt > 0.4) return {};
      const k = 1 - dt / 0.4;
      return { transform: `translate(${Math.sin(dt * 90) * 6 * k}px, ${Math.cos(dt * 70) * 4 * k}px)` };
    }
    case "blink": {
      if (dt < 0) return {};
      const phase = dt % 3.2;
      return { transform: `scaleY(${phase > 3.05 ? 0.15 : 1})` };
    }
    case "fly": {
      const [fx = 0, fy = 0] = f.from;
      if (dt < 0) return { transform: `translate(${fx}px, ${fy}px)`, opacity: "0" };
      const p = clamp(dt / f.d);
      const e = easeOutBack(p);
      return {
        transform: `translate(${fx * (1 - e)}px, ${fy * (1 - e)}px)`,
        opacity: String(Math.min(1, p * 3)),
      };
    }
    case "flyout": {
      const [tx = 0, ty = 0] = f.to;
      if (dt < 0) return { transform: "none", opacity: "1" };
      const p = clamp(dt / f.d);
      const e = easeInOut(p);
      return {
        transform: `translate(${tx * e}px, ${ty * e - Math.sin(p * Math.PI) * 60}px) rotate(${p * 25}deg)`,
        opacity: String(1 - clamp((p - 0.7) / 0.3)),
      };
    }
    case "count":
      if (f.text) f.text.textContent = `${Math.round(f.value * easeOut(clamp(dt / f.d)))}${f.suffix}`;
      return {};
  }
}

/* ------------------------------------------------------------------------------------------------------ */
/* Préférences de son (voix, musique, bruitages, volume), gardées dans ce navigateur                      */
/* ------------------------------------------------------------------------------------------------------ */

interface SoundPrefs extends AudioMix {
  voice: boolean;
  voiceName: string;
  muted: boolean;
}

const PREFS_KEY = "attesta.video.son";
const DEFAULT_PREFS: SoundPrefs = {
  volume: 0.7,
  effects: true,
  music: true,
  voice: true,
  voiceName: "",
  muted: false,
};

function readPrefs(): SoundPrefs {
  try {
    return {
      ...DEFAULT_PREFS,
      ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<SoundPrefs>),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Voix françaises du navigateur ; certaines arrivent après le chargement de la page. */
function useFrenchVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => frenchVoices());
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const update = () => setVoices(frenchVoices());
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}

/* ------------------------------------------------------------------------------------------------------ */
/* Le lecteur                                                                                             */
/* ------------------------------------------------------------------------------------------------------ */

/** Main tenant un feutre, pointe en (0, 0). */
function Hand() {
  return (
    <g transform="rotate(28)">
      <rect x={-12} y={-150} width={24} height={132} rx={7} fill="#3b403d" />
      <rect x={-13} y={-62} width={26} height={11} fill={LIME} />
      <path d="M 0 0 L -9 -20 L 9 -20 Z" fill={INK} />
      <ellipse cx={-4} cy={-46} rx={15} ry={22} fill="#f2cfae" stroke={INK} strokeWidth={3} />
      <ellipse cx={24} cy={-84} rx={36} ry={46} fill="#f2cfae" stroke={INK} strokeWidth={3} />
      <path d="M 30 -126 L 70 -230 L 120 -210 L 70 -110 Z" fill={GREEN} stroke={INK} strokeWidth={3} />
    </g>
  );
}

/** Éponge du changement de scène. */
function Eraser() {
  return (
    <g>
      <rect x={-1500} y={-20} width={1500} height={H + 40} fill="#ffffff" />
      <g transform="rotate(-8 0 360)">
        <rect x={-30} y={250} width={90} height={190} rx={18} fill="#3b6fb6" stroke={INK} strokeWidth={4} />
        <rect x={-30} y={250} width={90} height={60} rx={18} fill="#f1f2ec" stroke={INK} strokeWidth={4} />
      </g>
    </g>
  );
}

const SPEEDS = [1, 1.5, 2];

export function WhiteboardVideo() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [now, setNow] = useState(0);
  const [prefs, setPrefs] = useState<SoundPrefs>(readPrefs);
  const [speed, setSpeed] = useState(1);
  /** Déplacement manuel (barre, chapitres, flèches) : la voix repart de la bonne phrase. */
  const [seekCount, setSeekCount] = useState(0);
  const voices = useFrenchVoices();
  const time = useRef(0);
  const sceneIndex = useRef(0);
  const draws = useRef<DrawItem[]>([]);
  const fxs = useRef<FxItem[]>([]);
  const layer = useRef<SVGGElement>(null);
  const camera = useRef<SVGGElement>(null);
  const hand = useRef<SVGGElement>(null);
  const eraser = useRef<SVGGElement>(null);
  const handPos = useRef({ x: 1300, y: 760, a: 0, s: 1 });
  const stage = useRef<HTMLDivElement>(null);
  const audio = useRef<WhiteboardAudio | null>(null);
  const playingRef = useRef(false);
  /** Voix off en train de parler, et phrase en cours (pour reprendre après une pause). */
  const speaking = useRef(false);
  const sentence = useRef({ scene: -1, index: 0 });
  /** Début de l'attente de la fin d'une phrase, en fin de scène (la voix mène l'image). */
  const holdSince = useRef<number | null>(null);
  const voiceOn = prefs.voice && !prefs.muted && voices.length > 0;
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  playingRef.current = playing;
  const reduced = useRef(
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  /** Applique l'horloge : dessin, mouvements, caméra, éponge et main. */
  const apply = useCallback(() => {
    const s = SCENES[sceneIndex.current]!;
    const local = time.current - STARTS[sceneIndex.current]!;
    const still = reduced.current;
    let target: { x: number; y: number } | null = null;
    let writing = false;

    for (const it of draws.current) {
      const raw = clamp((local - it.s) / it.d);
      const p = still ? (local >= it.s ? 1 : 0) : raw;
      const active = raw > 0 && raw < 1;
      if (it.kind === "ink") {
        const e = easeInOut(p);
        it.el.style.strokeDashoffset = String(1 - e);
        // Pas encore commencé : masqué (sinon l'extrémité arrondie laisse un point).
        it.el.style.opacity = p > 0 ? "1" : "0";
        if (active) {
          target = (it.el as SVGPathElement).getPointAtLength(e * it.length);
          writing = true;
        }
      } else if (it.kind === "write") {
        it.el.style.clipPath = `inset(-20% ${(1 - p) * 100}% -20% 0) fill-box`;
        if (active) {
          target = {
            x: it.box.x + it.box.width * p,
            y: it.box.y + it.box.height * (0.7 + 0.15 * Math.sin(p * 40)),
          };
          writing = true;
        }
      } else {
        it.el.style.opacity = String(Math.min(1, p * 1.6));
        it.el.style.transform = `scale(${p === 0 ? 0.6 : Math.max(0.6, easeOutBack(p))})`;
        if (active) target = { x: it.box.x + it.box.width / 2, y: it.box.y + it.box.height / 2 };
      }
    }

    for (const f of fxs.current) {
      // Mouvement réduit : aucun déplacement, mais les compteurs affichent leur valeur au bon moment.
      if (still) {
        if (f.kind === "count" && f.text) f.text.textContent = `${local >= f.s ? f.value : 0}${f.suffix}`;
        continue;
      }
      const style = fxStyle(f, local);
      f.el.style.transform = style.transform ?? "";
      if (style.opacity !== undefined) f.el.style.opacity = style.opacity;
    }

    // Caméra : plans interpolés, plus une secousse brève à chaque impact.
    const cam = still ? WIDE : cameraAt(s.camera, local);
    let sx = 0;
    let sy = 0;
    for (const at of s.shakes ?? []) {
      const dt = local - at;
      if (!still && dt >= 0 && dt < 0.35) {
        const k = 1 - dt / 0.35;
        sx += Math.sin(dt * 95) * 9 * k;
        sy += Math.cos(dt * 80) * 6 * k;
      }
    }
    camera.current?.setAttribute(
      "transform",
      `translate(${W / 2 + sx} ${H / 2 + sy}) scale(${cam.z}) translate(${-cam.x} ${-cam.y})`,
    );

    // Coup d'éponge pendant les dernières secondes de chaque scène (sauf la dernière).
    const erase =
      sceneIndex.current < SCENES.length - 1 && !still ? clamp((local - (s.duration - ERASE)) / ERASE) : 0;
    // L'éponge (bord droit du voile blanc) traverse le tableau ; en fin de course, le voile couvre tout.
    eraser.current?.setAttribute(
      "transform",
      `translate(${erase === 0 ? -200 : -60 + easeInOut(erase) * (W + 160)} 0)`,
    );

    // Main : rejoint le trait, s'incline et vibre en écrivant, se soulève entre deux traits.
    const h = handPos.current;
    const goal = target ?? (time.current >= TOTAL ? { x: 1400, y: 820 } : h);
    const angle = writing ? Math.sin(local * 26) * 5 : -6;
    const lift = writing ? 1 : 1.08;
    handPos.current = {
      x: h.x + (goal.x - h.x) * 0.35,
      y: h.y + (goal.y - h.y) * 0.35 - (writing ? 0 : 0.6),
      a: h.a + (angle - h.a) * 0.3,
      s: h.s + (lift - h.s) * 0.25,
    };
    const n = handPos.current;
    hand.current?.setAttribute("transform", `translate(${n.x} ${n.y}) rotate(${n.a}) scale(${n.s})`);
    // Feutre : intensité et hauteur selon la vitesse de la main, son placé à gauche ou à droite comme elle.
    audio.current?.marker(writing && playingRef.current, Math.hypot(n.x - h.x, n.y - h.y), n.x / W);
  }, []);

  // Nouvelle scène : on recense ses éléments dessinables et ses mouvements, puis on applique l'horloge.
  useLayoutEffect(() => {
    sceneIndex.current = scene;
    const root = layer.current;
    draws.current = [...(root?.querySelectorAll<SVGGraphicsElement>("[data-s]") ?? [])].map((el) => ({
      el,
      kind: el.classList.contains("wb-ink") ? "ink" : el.classList.contains("wb-write") ? "write" : "pop",
      s: Number(el.dataset.s),
      d: Number(el.dataset.d),
      length: el instanceof SVGPathElement ? el.getTotalLength() : 0,
      box: el.getBBox(),
    }));
    fxs.current = [...(root?.querySelectorAll<SVGGElement>("[data-fx]") ?? [])].map((el) => {
      const origin = nums(el.dataset.origin);
      el.style.transformBox = origin.length ? "view-box" : "fill-box";
      el.style.transformOrigin = origin.length ? `${origin[0]}px ${origin[1]}px` : "center";
      return {
        el,
        kind: el.dataset.fx as FxKind,
        s: Number(el.dataset.fs),
        d: Number(el.dataset.fd),
        amp: Number(el.dataset.amp),
        freq: Number(el.dataset.freq),
        axis: el.dataset.axis ?? "y",
        from: nums(el.dataset.from),
        to: nums(el.dataset.to),
        value: Number(el.dataset.value ?? 0),
        suffix: el.dataset.suffix ?? "",
        text: el.querySelector("text"),
      };
    });
    apply();
  }, [scene, apply]);

  // Horloge : avance pendant la lecture (à la vitesse choisie), change de scène, s'arrête à la fin.
  useEffect(() => {
    audio.current?.playMusic(playing);
    if (!playing) {
      audio.current?.marker(false);
      return;
    }
    let last = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const before = time.current;
      const s = SCENES[sceneIndex.current]!;
      const local = before - STARTS[sceneIndex.current]!;
      // La voix mène l'image : en fin de scène, on attend la fin de la phrase (4 s au plus).
      const last1 = sceneIndex.current === SCENES.length - 1;
      const edge = s.duration - (last1 ? 0.15 : ERASE + 0.1);
      const wait = voiceRef.current && speaking.current && local >= edge;
      if (wait) holdSince.current ??= t;
      else holdSince.current = null;
      const holding = wait && t - holdSince.current! < 4000;
      if (!holding) time.current = Math.min(TOTAL, before + ((t - last) / 1000) * speed);
      last = t;
      const index = sceneAt(time.current);
      if (index !== sceneIndex.current) {
        sceneIndex.current = index;
        setScene(index);
        audio.current?.chime();
      } else {
        cue(local, time.current - STARTS[index]!);
      }
      apply();
      setNow(time.current);
      if (time.current >= TOTAL) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, apply]);

  /** Bruitages ponctuels franchis entre deux images : apparitions, impacts, coup d'éponge. */
  const cue = (from: number, to: number) => {
    const a = audio.current;
    if (!a || to <= from || to - from > 0.5) return;
    const crossed = (at: number) => at > from && at <= to;
    const s = SCENES[sceneIndex.current]!;
    if (draws.current.some((it) => it.kind === "pop" && crossed(it.s))) a.pop();
    if ((s.shakes ?? []).some(crossed)) a.thud();
    if (sceneIndex.current < SCENES.length - 1 && crossed(s.duration - ERASE)) a.whoosh(ERASE / speed);
  };

  // Mixage : volume, musique et bruitages suivent les préférences (gardées dans ce navigateur).
  useEffect(() => {
    audio.current?.setMix({
      volume: prefs.muted ? 0 : prefs.volume,
      effects: prefs.effects,
      music: prefs.music,
    });
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Stockage indisponible (navigation privée) : les préférences valent pour cette visite.
    }
  }, [prefs]);

  useEffect(
    () => () => {
      audio.current?.close();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    },
    [],
  );

  // Voix off : la narration est lue phrase par phrase, avec la meilleure voix française du navigateur.
  // Après une pause, elle reprend à la phrase interrompue ; après un déplacement, à la phrase du moment.
  useEffect(() => {
    const synth = typeof speechSynthesis === "undefined" ? null : speechSynthesis;
    if (!synth) return;
    synth.cancel();
    speaking.current = false;
    audio.current?.duck(false);
    if (!voiceOn || !playing) return;
    const parts = sentences(SCENES[scene]!.narration);
    const local = time.current - STARTS[scene]!;
    const span = Math.max(1, SCENES[scene]!.duration - ERASE - 0.5);
    const from =
      sentence.current.scene === scene
        ? sentence.current.index
        : local < 0.4
          ? 0
          : Math.min(parts.length - 1, Math.floor((local / span) * parts.length));
    const chosen = voices.find((v) => v.name === prefs.voiceName) ?? voices[0];
    let cancelled = false;
    parts.slice(from).forEach((text, k) => {
      const index = from + k;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = chosen?.lang ?? "fr-FR";
      if (chosen) u.voice = chosen;
      u.rate = Math.min(1.7, 0.98 * speed);
      u.pitch = 1;
      u.onstart = () => {
        speaking.current = true;
        sentence.current = { scene, index };
        audio.current?.duck(true);
      };
      const done = () => {
        if (cancelled || index !== parts.length - 1) return;
        speaking.current = false;
        sentence.current = { scene, index: parts.length };
        audio.current?.duck(false);
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });
    return () => {
      cancelled = true;
      synth.cancel();
      speaking.current = false;
      audio.current?.duck(false);
    };
  }, [scene, playing, voiceOn, speed, prefs.voiceName, voices, seekCount]);

  const seek = (t: number) => {
    time.current = Math.min(TOTAL, Math.max(0, t));
    const index = sceneAt(time.current);
    if (index !== sceneIndex.current) setScene(index);
    else apply();
    setNow(time.current);
    sentence.current = { scene: -1, index: 0 };
    holdSince.current = null;
    setSeekCount((n) => n + 1);
  };
  const play = () => {
    // Le son ne peut démarrer que sur un geste de l'utilisateur : le contexte audio naît ici.
    audio.current ??= new WhiteboardAudio();
    audio.current.start();
    audio.current.setMix({
      volume: prefs.muted ? 0 : prefs.volume,
      effects: prefs.effects,
      music: prefs.music,
    });
    if (time.current >= TOTAL) seek(0);
    setStarted(true);
    setPlaying(true);
  };
  const setPref = <K extends keyof SoundPrefs>(key: K, value: SoundPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      if (playing) setPlaying(false);
      else play();
    }
    if (e.key === "ArrowRight") seek(time.current + 5);
    if (e.key === "ArrowLeft") seek(time.current - 5);
  };
  const ended = started && !playing && now >= TOTAL;

  return (
    <section aria-labelledby="video-titre" className="mb-12">
      <h2 id="video-titre" className="sr-only">
        Vidéo : Attesta en 1 minute 20
      </h2>
      <div
        ref={stage}
        tabIndex={0}
        onKeyDown={onKey}
        aria-label="Lecteur vidéo. Espace : lecture ou pause ; flèches : reculer ou avancer de 5 secondes."
        className="wb-stage relative overflow-hidden rounded-[2rem] border-8 border-[#3b403d] shadow-float"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={SCENES[scene]!.narration}
          className="block w-full"
        >
          <g ref={camera}>
            <g key={scene} ref={layer}>
              {SCENES[scene]!.art}
            </g>
            {!reduced.current && (
              <g
                ref={hand}
                aria-hidden="true"
                transform="translate(1300 760)"
                style={{ opacity: ended ? 0 : 1, transition: "opacity 400ms" }}
              >
                <Hand />
              </g>
            )}
          </g>
          <g ref={eraser} aria-hidden="true" transform="translate(-200 0)">
            <Eraser />
          </g>
        </svg>

        {/* Titre du chapitre qui glisse au début de chaque scène. */}
        {started && !ended && (
          <p
            key={scene}
            aria-hidden="true"
            className="wb-chapter absolute top-4 left-4 rounded-full bg-[#1d2a22] px-4 py-1.5 font-sans text-sm font-bold text-[#e3f56b]"
          >
            {scene + 1}/{SCENES.length} · {SCENES[scene]!.chapter}
          </p>
        )}

        {/* Sous-titres : toujours affichés (la voix off est facultative). */}
        {started && (
          <p className="wb-subtitle absolute inset-x-0 bottom-3 mx-auto max-w-3xl px-6 text-center text-lg font-semibold sm:text-2xl">
            {SCENES[scene]!.narration}
          </p>
        )}

        {/* Barre de progression fine, dans l'image. */}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5 bg-[#1d2a22]/10">
          <span className="block h-full bg-[#2f8f4e]" style={{ width: `${(now / TOTAL) * 100}%` }} />
        </span>

        {/* Affiche de départ et écran de fin. */}
        {!started && (
          <button
            type="button"
            onClick={play}
            className="group absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[2px]"
          >
            <span className="flex flex-col items-center gap-4">
              <span className="grid size-24 animate-pulse place-items-center rounded-full bg-[#e3f56b] text-4xl text-[#1d2a22] shadow-float transition-transform group-hover:scale-110 group-hover:animate-none">
                ▶
              </span>
              <span className="text-4xl font-bold">Attesta en 1 minute 20</span>
              <span className="text-2xl">Lancer la vidéo</span>
            </span>
          </button>
        )}
        {ended && (
          <div className="absolute inset-0 grid animate-enter place-items-center bg-white/80 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-4 font-sans">
              <p className="text-2xl font-bold text-[#1d2a22]">À vous de jouer !</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/cv" className={buttonClass("primary", "lg", WITH_ARROW)}>
                  Créer mon CV ciblé
                  <ArrowBadge />
                </Link>
                <button
                  type="button"
                  onClick={play}
                  className="rounded-full border-2 border-[#1d2a22] px-6 py-3 font-semibold text-[#1d2a22]"
                >
                  ↺ Revoir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Commandes du lecteur. */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => (playing ? setPlaying(false) : play())}
          aria-label={playing ? "Pause" : "Lecture"}
        >
          {playing ? "❚❚ Pause" : "▶ Lecture"}
        </Button>
        <span className="w-24 text-sm font-semibold tabular-nums">
          {clock(now)} / {clock(TOTAL)}
        </span>
        <label htmlFor="video-position" className="sr-only">
          Position dans la vidéo
        </label>
        <input
          id="video-position"
          type="range"
          min={0}
          max={TOTAL}
          step={0.1}
          value={now}
          onChange={(e) => {
            setStarted(true);
            seek(Number(e.target.value));
          }}
          className="min-w-40 flex-1 accent-accent-text"
        />
        <Button
          variant="ghost"
          aria-label={`Vitesse de lecture : ${speed} fois`}
          onClick={() => setSpeed((v) => SPEEDS[(SPEEDS.indexOf(v) + 1) % SPEEDS.length]!)}
        >
          ×{String(speed).replace(".", ",")}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={!prefs.muted}
          aria-label={prefs.muted ? "Activer le son" : "Couper le son"}
          onClick={() => setPref("muted", !prefs.muted)}
        >
          {prefs.muted ? "🔇" : "🔊"}
        </Button>
        <label htmlFor="video-volume" className="sr-only">
          Volume
        </label>
        <input
          id="video-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={prefs.muted ? 0 : prefs.volume}
          onChange={(e) => setPrefs((p) => ({ ...p, volume: Number(e.target.value), muted: false }))}
          className="w-24 accent-accent-text"
        />
        <Button variant="ghost" onClick={() => void stage.current?.requestFullscreen?.()}>
          ⛶ Plein écran
        </Button>
      </div>
      {/* Réglages du son : voix off (et choix de la voix), musique d'ambiance, bruitages. */}
      <details className="mt-3 rounded-2xl border border-line p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Réglages du son</summary>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          {(
            [
              ["voice", "Voix off"],
              ["music", "Musique d'ambiance"],
              ["effects", "Bruitages (feutre, éponge…)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-accent-text"
                checked={prefs[key]}
                onChange={(e) => setPref(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
          {voices.length > 0 ? (
            <label className="flex items-center gap-2">
              Voix
              <select
                className="input py-1"
                value={prefs.voiceName || voices[0]!.name}
                disabled={!prefs.voice}
                onChange={(e) => setPref("voiceName", e.target.value)}
              >
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name.replace(/^Microsoft /, "").replace(/ - .*$/, "")}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-ink-muted">
              Aucune voix française sur ce navigateur : les sous-titres restent affichés.
            </p>
          )}
        </div>
        <p className="mt-3 text-ink-muted">
          Conseil : Microsoft Edge propose des voix naturelles (Denise, Henri, Vivienne…), les plus agréables.
        </p>
      </details>
      <nav aria-label="Chapitres de la vidéo" className="mt-3">
        <ol className="flex flex-wrap gap-2">
          {SCENES.map((s, i) => (
            <li key={s.chapter}>
              <button
                type="button"
                aria-current={scene === i && started ? "step" : undefined}
                onClick={() => {
                  setStarted(true);
                  seek(STARTS[i]!);
                }}
                className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${scene === i && started ? "border-accent bg-accent text-on-accent" : "border-line text-ink-muted hover:text-ink"}`}
              >
                {clock(STARTS[i]!)} · {s.chapter}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}
