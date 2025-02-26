const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 메모리 내 방 상태 저장 (운영 시 데이터베이스 사용 권장)
const rooms = {};

io.on('connection', (socket) => {
  console.log('새 소켓 연결:', socket.id);

  // 방 생성 요청 처리
  socket.on('createRoom', (roomCode) => {
    rooms[roomCode] = { userProducts: {} };
    console.log(`방 생성: ${roomCode}`);
  });

  // 방 참여 요청 처리
  socket.on('joinRoom', (roomCode) => {
    socket.join(roomCode);
    console.log(`소켓 ${socket.id}가 방 ${roomCode}에 참여`);
    if (rooms[roomCode]) {
      socket.emit('update', rooms[roomCode]);
    } else {
      rooms[roomCode] = { userProducts: {} };
      socket.emit('update', rooms[roomCode]);
    }
  });

  // 여러 제품 선택 업데이트 요청 처리
  socket.on('selectProducts', ({ roomCode, user, products }) => {
    if (!rooms[roomCode].userProducts[user]) {
      rooms[roomCode].userProducts[user] = [];
    }
    rooms[roomCode].userProducts[user] = rooms[roomCode].userProducts[user].concat(products);
    console.log(`사용자 ${user}가 ${roomCode} 방에서 제품 선택: ${products.map(p => p.name).join(', ')}`);
    io.to(roomCode).emit('update', rooms[roomCode]);
  });

  // 제품 삭제 요청 처리
  socket.on('removeProduct', ({ roomCode, user, productName }) => {
    if (rooms[roomCode] && rooms[roomCode].userProducts[user]) {
      const index = rooms[roomCode].userProducts[user].findIndex(prod => prod.name === productName);
      if (index > -1) {
        rooms[roomCode].userProducts[user].splice(index, 1);
        console.log(`사용자 ${user}가 ${roomCode} 방에서 ${productName} 삭제`);
      }
      io.to(roomCode).emit('update', rooms[roomCode]);
    }
  });
});

server.listen(3000, () => {
  console.log('서버 실행 중: http://localhost:3000');
});
