FROM node:20.19.5 AS base

WORKDIR /overleaf/services/llm


FROM base AS app

COPY package.json package-lock.json /overleaf/
COPY services/llm/package.json /overleaf/services/llm/
COPY libraries/ /overleaf/libraries/
COPY patches/ /overleaf/patches/


RUN cd /overleaf && npm install

COPY services/llm/ /overleaf/services/llm/

FROM app
USER node
CMD ["node", "--expose-gc", "app.js"]


