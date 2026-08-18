# Graph Report - .  (2026-06-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 604 nodes · 965 edges · 34 communities (30 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6d6f3ada`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 22 edges
2. `getDatabase()` - 19 edges
3. `expo` - 15 edges
4. `spacing` - 13 edges
5. `Track` - 12 edges
6. `scripts` - 11 edges
7. `notify()` - 10 edges
8. `importBlob()` - 9 edges
9. `ios` - 8 edges
10. `importFromUri()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Assert-Prerequisites()` --calls--> `eas`  [INFERRED]
  tools/ps/BuildAndDeployiOS.ps1 → app.json
- `TabLayout()` --calls--> `useTheme()`  [EXTRACTED]
  app/(tabs)/_layout.tsx → src/hooks/useTheme.ts
- `NotFoundScreen()` --calls--> `useTheme()`  [EXTRACTED]
  app/+not-found.tsx → src/hooks/useTheme.ts
- `RootLayout()` --calls--> `useTheme()`  [EXTRACTED]
  app/_layout.tsx → src/hooks/useTheme.ts
- `LibraryScreen()` --calls--> `useTheme()`  [EXTRACTED]
  app/(tabs)/index.tsx → src/hooks/useTheme.ts

## Import Cycles
- None detected.

## Communities (34 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (44): RootLayout(), unstable_settings, NotFoundScreen(), styles, PlayerScreen(), styles, styles, styles (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (51): clampVolume(), clearMarkers(), currentState, errorMessage(), getState(), getVolume(), getWebMediaElement(), IDLE_STATE (+43 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (33): CountdownOverlayProps, styles, DURATION_PRESETS, styles, DEFAULT_CONFIG, IDLE_STATE, UseCountdownOptions, beatIntervalMs() (+25 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (40): closeDatabase(), getDatabase(), migrateTracksSchema(), getNumber(), getSetting(), setNumber(), setSetting(), SettingRow (+32 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (24): styles, VolumeControlProps, attach(), AudioContextCtor, clamp01(), detach(), ensureContext(), getAudioContextCtor() (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (35): estimateDurationMs(), EXTENSION_TO_FORMAT, getExtension(), importBlob(), importFromUri(), isSupportedFilename(), makeError(), openFilePicker() (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (20): MarkerControlsProps, statusCaption(), styles, DragTarget, styles, WaveformViewProps, IDLE_STATE, IDLE_STATE (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (21): EMPTY_PEAKS, WaveformDataState, createHandleReader(), extractPeaks(), extractPeaks(), ByteReader, computePeaks(), createBufferReader() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (31): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, intentFilters, package, typedRoutes (+23 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (24): devDependencies, eslint, eslint-config-expo, fake-indexeddb, jest-expo, prettier, @types/jest, @types/react (+16 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (18): ensureTracksDir(), estimateDurationMs(), EXTENSION_TO_FORMAT, getExtension(), importFromUri(), isSupportedFilename(), makeError(), parseFormat() (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (21): buildType, serviceAccountKeyPath, track, build, development, preview, production, cli (+13 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (21): dependencies, expo, expo-audio, expo-constants, expo-crypto, expo-file-system, expo-font, expo-linking (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.21
Nodes (16): projectId, extra, eas, router, Add-BuildEntry(), Assert-Prerequisites(), Get-BuildLogPath(), Read-BuildLog() (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.27
Nodes (4): Add-BuildEntry(), Read-BuildLog(), Write-BuildLog(), Write-Warn()

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (3): getTouchArea(), layout(), RNGH

### Community 16 - "Community 16"
Cohesion: 0.46
Nodes (7): Assert-Prerequisites(), Test-Command(), Wait-AndExit(), Write-Err(), Write-Ok(), Write-Step(), Write-Warn()

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, exclude, extends, include, @/*

## Knowledge Gaps
- **230 isolated node(s):** `version`, `configurations`, `name`, `slug`, `owner` (+225 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `Community 0` to `Community 2`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `getDatabase()` connect `Community 3` to `Community 5`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `Track` connect `Community 0` to `Community 2`, `Community 10`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `version`, `configurations`, `name` to the rest of the system?**
  _230 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05442428730099963 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06390977443609022 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05803921568627451 - nodes in this community are weakly interconnected._