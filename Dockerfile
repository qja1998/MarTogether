FROM node:14-alpine

WORKDIR /app

# package.json 복사 및 의존성 설치
COPY package*.json ./
RUN npm install

# 전체 소스 복사
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
