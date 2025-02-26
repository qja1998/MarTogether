// Socket.IO는 서버에서 정적으로 제공되므로, /socket.io/socket.io.js 경로로 로드됨
const socket = io();
let currentUser = '';
let currentRoomCode = '';

const products = [
  { name: '제품 A', price: 10000 },
  { name: '제품 B', price: 20000 },
  { name: '제품 C', price: 30000 },
  { name: '제품 D', price: 40000 }
];

// 방 생성 버튼 클릭 이벤트
document.getElementById('create-room-btn').addEventListener('click', () => {
  currentRoomCode = generateRoomCode();
  document.getElementById('room-code').textContent = currentRoomCode;
  document.getElementById('room-code-display').classList.remove('hidden');
  // 서버에 새 방 생성 요청
  socket.emit('createRoom', currentRoomCode);
});

// 방 참여 버튼 클릭 이벤트
document.getElementById('join-room-btn').addEventListener('click', () => {
  const joinRoomCode = document.getElementById('join-room-code').value.trim().toUpperCase();
  const userName = document.getElementById('user-name').value.trim();
  
  if (!joinRoomCode || !userName) {
    alert('방 코드와 사용자 이름을 입력하세요.');
    return;
  }
  
  currentUser = userName;
  currentRoomCode = joinRoomCode;
  // 서버에 방 참여 요청 (해당 방에 소켓 입장)
  socket.emit('joinRoom', currentRoomCode);
  
  // UI 업데이트: 방 참여 영역 숨기고 제품 선택 영역 표시
  document.getElementById('join-room').classList.add('hidden');
  document.getElementById('product-selection').classList.remove('hidden');
  loadProductList();
});

// 제품 선택 확인 버튼 클릭 이벤트 (체크박스 사용)
document.getElementById('confirm-selection-btn').addEventListener('click', () => {
  const selectedCheckboxes = document.querySelectorAll('input[name="product"]:checked');
  if (!selectedCheckboxes.length) {
    alert('하나 이상의 제품을 선택해주세요.');
    return;
  }
  
  const selectedProducts = Array.from(selectedCheckboxes).map(cb => {
    return products[parseInt(cb.value)];
  });
  
  // 선택된 제품들을 서버로 전송
  socket.emit('selectProducts', { roomCode: currentRoomCode, user: currentUser, products: selectedProducts });
});

// 제품 목록 로드 (체크박스 형태)
function loadProductList() {
  const productListUl = document.getElementById('product-list');
  productListUl.innerHTML = '';
  products.forEach((product, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <input type="checkbox" name="product" id="product-${index}" value="${index}">
      <label for="product-${index}">${product.name} - ${product.price.toLocaleString()}원</label>
    `;
    productListUl.appendChild(li);
  });
}

// Socket.IO 업데이트 이벤트 수신
socket.on('update', (data) => {
  displayUserProducts(data.userProducts);
});

// 합계 및 추가 정보 계산 함수
// 각 제품에 대해 선택한 유저 수를 계산하고, 인당 가격을 산출합니다.
function computeTotals(userProducts) {
  const productUserMap = {};
  for (const user in userProducts) {
    userProducts[user].forEach(prod => {
      if (!productUserMap[prod.name]) {
        productUserMap[prod.name] = new Set();
      }
      productUserMap[prod.name].add(user);
    });
  }
  
  const userTotals = {};
  let overallTotal = 0;
  for (const user in userProducts) {
    let total = 0;
    userProducts[user].forEach(prod => {
      const count = productUserMap[prod.name].size;
      total += prod.price / count;
    });
    userTotals[user] = total;
    overallTotal += total;
  }
  
  return { userTotals, overallTotal, productUserMap };
}

// 사용자별 선택한 제품 목록, 각 제품의 원래 가격, 선택 인원, 인당 가격 및 합계 표시
// 단, 현재 사용자가 이미 선택한 제품만 체크박스에서 비활성화됩니다.
function displayUserProducts(userProducts) {
  const userProductsDiv = document.getElementById('user-products');
  userProductsDiv.innerHTML = '';
  
  const { userTotals, overallTotal, productUserMap } = computeTotals(userProducts);
  
  // 현재 사용자가 선택한 제품 목록만 가져옴
  const currentUserSelections = userProducts[currentUser] || [];
  
  // 제품 선택 목록의 체크박스 업데이트: 현재 사용자가 선택한 제품만 비활성화
  document.querySelectorAll('input[name="product"]').forEach(checkbox => {
    const index = parseInt(checkbox.value);
    const productName = products[index].name;
    if (currentUserSelections.find(prod => prod.name === productName)) {
      checkbox.disabled = true;
      checkbox.checked = false;
    } else {
      checkbox.disabled = false;
    }
  });
  
  // 각 유저별 정보 표시
  for (const user in userProducts) {
    const section = document.createElement('div');
    section.innerHTML = `<h3>${user} (총 합: ${userTotals[user].toLocaleString()}원)</h3>`;
    const ul = document.createElement('ul');
    userProducts[user].forEach((prod, idx) => {
      const count = productUserMap[prod.name].size;
      const perPerson = prod.price / count;
      const li = document.createElement('li');
      // 현재 사용자에 대해서만 삭제 버튼 표시
      li.innerHTML = `${prod.name} - 원래 가격: ${prod.price.toLocaleString()}원, 선택 인원: ${count}명, 인당 가격: ${perPerson.toLocaleString()}원 
        ${user === currentUser ? `<button class="delete-btn" data-user="${user}" data-product="${prod.name}" data-index="${idx}">삭제</button>` : ''}`;
      ul.appendChild(li);
    });
    section.appendChild(ul);
    userProductsDiv.appendChild(section);
  }
  
  // 전체 합계 표시
  const overallDiv = document.createElement('div');
  overallDiv.style.marginTop = '20px';
  overallDiv.innerHTML = `<h2>전체 합계: ${overallTotal.toLocaleString()}원</h2>`;
  userProductsDiv.appendChild(overallDiv);
  
  document.getElementById('user-products-display').classList.remove('hidden');
}

// 삭제 버튼 이벤트 처리 (이벤트 위임)
document.getElementById('user-products').addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('delete-btn')) {
    const user = e.target.getAttribute('data-user');
    const productName = e.target.getAttribute('data-product');
    socket.emit('removeProduct', { roomCode: currentRoomCode, user, productName });
  }
});

// 임의의 방 코드 생성 함수 (대문자와 숫자)
function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
