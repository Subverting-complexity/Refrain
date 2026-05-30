import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { BACKGROUND_DARK, BACKGROUND_LIGHT } from '@/src/theme';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
body { background-color: ${BACKGROUND_DARK}; }
@media (prefers-color-scheme: light) {
  body { background-color: ${BACKGROUND_LIGHT}; }
}
#root { display: flex; flex: 1; }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
