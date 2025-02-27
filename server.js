require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

const app = express();

// 필요 시 CORS 설정 추가 (다른 도메인에서 API 호출이 가능하도록)
const cors = require('cors');
app.use(cors());

app.use(express.json());
app.use(express.static('public'));

// 방별 상태
const rooms = {};
const defaultProducts = []; // 초기 제품 목록은 빈 배열

// LLM 파싱 엔드포인트 (OpenAI API 사용, Chat API)
app.post('/llm/parseReceipt', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt 필수' });
  try {
    const response = await fetch(process.env.OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo", // 또는 원하는 채팅 모델
        messages: [
          { role: "system", content: "You are a helpful assistant that extracts product information from OCR results of receipts. Return the output as a JSON array where each item is in the format {\"name\": productName, \"price\": productPrice}." },
          { role: "user", content: prompt }
        ],
        max_tokens: 250,
        temperature: 0.2
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API 호출 실패:', errorText);
      return res.status(500).json({ error: 'OpenAI API 호출 실패' });
    }
    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n/, '');
      content = content.replace(/\n```$/, '');
    }
    if (content.startsWith('[') && !content.endsWith(']')) {
      console.warn('응답 내용이 완전하지 않습니다. 자동으로 ]를 추가합니다.');
      content += ']';
    }
    let products;
    try {
      products = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError, '응답 내용:', content);
      return res.status(500).json({ error: 'JSON 파싱 오류' });
    }
    res.json({ products });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'LLM 파싱 중 오류 발생' });
  }
});

const serverInstance = http.createServer(app);
const io = new Server(serverInstance);

io.on('connection', (socket) => {
  console.log('[server] 새 소켓 연결:', socket.id);

  socket.on('createRoom', (roomCode) => {
    rooms[roomCode] = { userProducts: {}, products: [...defaultProducts] };
    console.log('[server] 방 생성:', roomCode);
  });

  socket.on('joinRoom', (roomCode) => {
    socket.join(roomCode);
    console.log(`[server] 소켓 ${socket.id} 방 참여: ${roomCode}`);
    if (!rooms[roomCode]) {
      rooms[roomCode] = { userProducts: {}, products: [...defaultProducts] };
    }
    socket.emit('update', rooms[roomCode]);
    socket.emit('roomProducts', rooms[roomCode].products);
  });

  socket.on('selectProducts', ({ roomCode, user, products }) => {
    if (!rooms[roomCode].userProducts[user]) {
      rooms[roomCode].userProducts[user] = [];
    }
    rooms[roomCode].userProducts[user] = rooms[roomCode].userProducts[user].concat(products);
    console.log(`[server] 사용자 ${user} 방 ${roomCode} 제품 선택: ${products.map(p => p.name).join(', ')}`);
    io.to(roomCode).emit('update', rooms[roomCode]);
  });

  socket.on('removeProduct', ({ roomCode, user, productName }) => {
    if (rooms[roomCode] && rooms[roomCode].userProducts[user]) {
      const idx = rooms[roomCode].userProducts[user].findIndex(prod => prod.name === productName);
      if (idx > -1) {
        rooms[roomCode].userProducts[user].splice(idx, 1);
        console.log(`[server] 사용자 ${user} 방 ${roomCode} 제품 삭제: ${productName}`);
      }
      io.to(roomCode).emit('update', rooms[roomCode]);
    }
  });

  socket.on('updateProduct', ({ roomCode, user, oldProductName, newProduct }) => {
    if (rooms[roomCode] && rooms[roomCode].userProducts[user]) {
      const idx = rooms[roomCode].userProducts[user].findIndex(prod => prod.name === oldProductName);
      if (idx > -1) {
        rooms[roomCode].userProducts[user][idx] = newProduct;
        console.log(`[server] 사용자 ${user} 방 ${roomCode} 제품 수정: ${oldProductName} -> ${newProduct.name}`);
      }
      io.to(roomCode).emit('update', rooms[roomCode]);
    }
  });

  socket.on('addRoomProduct', ({ roomCode, product }) => {
    if (rooms[roomCode]) {
      rooms[roomCode].products.push(product);
      console.log(`[server] 방 ${roomCode} 제품 추가: ${product.name} - ${product.price}`);
      io.to(roomCode).emit('roomProducts', rooms[roomCode].products);
    }
  });

  socket.on('updateRoomProduct', ({ roomCode, index, newProduct }) => {
    if (rooms[roomCode] && rooms[roomCode].products[index]) {
      rooms[roomCode].products[index] = newProduct;
      console.log(`[server] 방 ${roomCode} 제품 수정: index ${index} -> ${newProduct.name}`);
      io.to(roomCode).emit('roomProducts', rooms[roomCode].products);
    }
  });

  socket.on('removeRoomProduct', ({ roomCode, index }) => {
    if (rooms[roomCode] && rooms[roomCode].products[index]) {
      console.log(`[server] 방 ${roomCode} 제품 삭제: ${rooms[roomCode].products[index].name}`);
      rooms[roomCode].products.splice(index, 1);
      io.to(roomCode).emit('roomProducts', rooms[roomCode].products);
    }
  });
});

// 외부에서도 접근할 수 있도록 0.0.0.0으로 바인딩
const PORT = process.env.PORT || 3000;
serverInstance.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] 서버 실행 중: http://localhost:${PORT}`);
});
