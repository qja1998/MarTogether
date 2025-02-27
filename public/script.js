/********************************************
 * Socket 연결 및 전역 변수
 ********************************************/
const socket = io();
let currentUser = '';
let currentRoomCode = '';
let roomProducts = []; // 방 내 제품 목록
let cropper = null;    // Cropper.js 인스턴스

/********************************************
 * 방 생성 및 참여
 ********************************************/
document.getElementById('create-room-btn').addEventListener('click', () => {
  currentRoomCode = generateRoomCode();
  document.getElementById('room-code').textContent = currentRoomCode;
  document.getElementById('room-code-display').classList.remove('hidden');
  socket.emit('createRoom', currentRoomCode);
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const joinRoomCode = document.getElementById('join-room-code').value.trim().toUpperCase();
  const userName = document.getElementById('user-name').value.trim();
  if (!joinRoomCode || !userName) {
    alert('방 코드와 사용자 이름을 입력하세요.');
    return;
  }
  currentUser = userName;
  currentRoomCode = joinRoomCode;
  socket.emit('joinRoom', currentRoomCode);
  document.getElementById('join-room').classList.add('hidden');
  document.getElementById('product-section').classList.remove('hidden');
  loadProductList();
});

/********************************************
 * 영수증 업로드 및 크롭 처리 (Cropper.js)
 ********************************************/
document.getElementById('receipt-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const imgURL = URL.createObjectURL(file);
  const cropImage = document.getElementById('crop-image');
  cropImage.src = imgURL;
  document.getElementById('crop-container').classList.remove('hidden');
  
  cropImage.onload = () => {
    if (cropper) {
      cropper.destroy();
    }
    // 자유로운 비율로 크롭할 수 있도록 aspectRatio를 NaN으로 설정
    cropper = new Cropper(cropImage, {
      aspectRatio: NaN, 
      viewMode: 1,
      autoCropArea: 0.9,
      responsive: true
    });
  };
});

document.getElementById('crop-btn').addEventListener('click', () => {
  if (!cropper) return;
  const canvas = cropper.getCroppedCanvas();
  canvas.toBlob(blob => {
    document.getElementById('ocr-status').textContent = 'OCR 처리 중...';
    Tesseract.recognize(
      blob,
      'eng+kor',
      { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
      document.getElementById('ocr-status').textContent = 'OCR 완료. LLM 파싱 중...';
      parseWithLLM(text).then(extractedProducts => {
        if (extractedProducts.length > 0) {
          extractedProducts.forEach(prod => {
            socket.emit('addRoomProduct', { roomCode: currentRoomCode, product: prod });
          });
          document.getElementById('ocr-status').textContent = `추출 완료: ${extractedProducts.length}개 제품 추가됨.`;
        } else {
          document.getElementById('ocr-status').textContent = '제품 추출 실패: 유효한 제품 정보를 찾을 수 없습니다.';
        }
      }).catch(err => {
        console.error(err);
        document.getElementById('ocr-status').textContent = 'LLM 파싱 실패.';
      });
    }).catch(err => {
      console.error(err);
      document.getElementById('ocr-status').textContent = 'OCR 처리 실패.';
    });
  });
});

/********************************************
 * LLM 기반 파싱 함수 (OpenAI API 사용)
 ********************************************/
async function parseWithLLM(ocrText) {
  const response = await fetch('/llm/parseReceipt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: `다음 영수증 OCR 결과에서 제품명과 가격 정보를 JSON 배열로 추출해줘. 각 항목은 { "name": 제품명, "price": 가격 } 형태여야 해. OCR 결과: ${ocrText}`
    })
  });
  if (!response.ok) {
    throw new Error('LLM API 호출 실패');
  }
  const data = await response.json();
  return data.products || [];
}

/********************************************
 * 제품 선택 및 관리
 ********************************************/
document.getElementById('confirm-selection-btn').addEventListener('click', () => {
  const selectedCheckboxes = document.querySelectorAll('input[name="product"]:checked');
  if (!selectedCheckboxes.length) {
    alert('하나 이상의 제품을 선택해주세요.');
    return;
  }
  const selectedProducts = Array.from(selectedCheckboxes).map(cb => roomProducts[parseInt(cb.value)]);
  socket.emit('selectProducts', { roomCode: currentRoomCode, user: currentUser, products: selectedProducts });
});

document.getElementById('add-product-btn').addEventListener('click', () => {
  const nameInput = document.getElementById('new-product-name');
  const priceInput = document.getElementById('new-product-price');
  const name = nameInput.value.trim();
  const price = parseInt(priceInput.value);
  if (!name || isNaN(price)) {
    alert('제품 이름과 가격을 올바르게 입력하세요.');
    return;
  }
  socket.emit('addRoomProduct', { roomCode: currentRoomCode, product: { name, price } });
  nameInput.value = '';
  priceInput.value = '';
});

/********************************************
 * 제품 목록 로드 (체크박스 + 인라인 수정/삭제 아이콘)
 ********************************************/
function loadProductList() {
  const productListUl = document.getElementById('product-list');
  productListUl.innerHTML = '';
  roomProducts.forEach((product, index) => {
    const li = document.createElement('li');
    li.setAttribute('data-index', index);
    li.innerHTML = `
      <input type="checkbox" name="product" id="product-${index}" value="${index}">
      <span class="product-info">${product.name} - ${product.price.toLocaleString()}원</span>
      <i class="fa-solid fa-pen-to-square edit-room-btn" data-index="${index}" style="cursor:pointer; margin-left:10px;"></i>
      <i class="fa-solid fa-xmark delete-room-btn" data-index="${index}" style="cursor:pointer; margin-left:5px;"></i>
    `;
    productListUl.appendChild(li);
  });
}

/********************************************
 * 인라인 제품 수정 및 삭제 처리 (제품 목록 내)
 ********************************************/
document.getElementById('product-list').addEventListener('click', (e) => {
  // 수정: 연필 아이콘
  if (e.target.classList.contains('edit-room-btn')) {
    const index = parseInt(e.target.getAttribute('data-index'));
    const li = e.target.parentElement;
    if (li.querySelector('input.edit-input')) return; // 이미 수정 중이면 무시
    const currentProduct = roomProducts[index];
    const infoSpan = li.querySelector('.product-info');
    infoSpan.style.display = 'none';
    // 제품명 입력창
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.classList.add('edit-input');
    nameInput.value = currentProduct.name;
    nameInput.style.width = '100px';
    li.insertBefore(nameInput, e.target);
    // 가격 입력창
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.classList.add('edit-input');
    priceInput.value = currentProduct.price;
    priceInput.style.width = '80px';
    priceInput.style.marginLeft = '5px';
    li.insertBefore(priceInput, e.target);
    // 수정 아이콘 변경: 연필 -> 확인 (체크 아이콘)
    e.target.className = 'fa-solid fa-check confirm-room-btn';
    e.target.addEventListener('click', function confirmHandler() {
      const newName = nameInput.value.trim();
      const newPrice = parseInt(priceInput.value);
      if (!newName || isNaN(newPrice)) {
        alert('제품 이름과 가격을 올바르게 입력하세요.');
        return;
      }
      socket.emit('updateRoomProduct', { roomCode: currentRoomCode, index, newProduct: { name: newName, price: newPrice } });
    }, { once: true });
  }
  // 삭제: X 아이콘
  if (e.target.classList.contains('delete-room-btn')) {
    const index = parseInt(e.target.getAttribute('data-index'));
    socket.emit('removeRoomProduct', { roomCode: currentRoomCode, index });
  }
});

/********************************************
 * 서버 이벤트 처리
 ********************************************/
socket.on('roomProducts', (products) => {
  roomProducts = products;
  loadProductList();
});

socket.on('update', (data) => {
  displayUserProducts(data.userProducts);
});

/********************************************
 * 유저별 선택 제품 및 합계 표시
 ********************************************/
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

function displayUserProducts(userProducts) {
  const userProductsDiv = document.getElementById('user-products');
  userProductsDiv.innerHTML = '';
  const { userTotals, overallTotal, productUserMap } = computeTotals(userProducts);
  const currentUserSelections = userProducts[currentUser] || [];
  document.querySelectorAll('input[name="product"]').forEach(checkbox => {
    const idx = parseInt(checkbox.value);
    const productName = roomProducts[idx].name;
    if (currentUserSelections.find(prod => prod.name === productName)) {
      checkbox.disabled = true;
      checkbox.checked = false;
    } else {
      checkbox.disabled = false;
    }
  });
  for (const user in userProducts) {
    const section = document.createElement('div');
    section.innerHTML = `<h3>${user}</h3>`;
    const ul = document.createElement('ul');
    userProducts[user].forEach((prod) => {
      const count = productUserMap[prod.name].size;
      const perPerson = prod.price / count;
      const li = document.createElement('li');
      li.textContent = `${prod.name} (원가: ${prod.price.toLocaleString()}원, ${count}명 선택, 1인: ${perPerson.toLocaleString()}원)`;
      ul.appendChild(li);
    });
    section.appendChild(ul);
    section.innerHTML += `<p>총 합: ${(userTotals[user] || 0).toLocaleString()}원</p>`;
    userProductsDiv.appendChild(section);
  }
  const overallDiv = document.createElement('div');
  overallDiv.style.marginTop = '10px';
  overallDiv.innerHTML = `<h3>전체 합계: ${overallTotal.toLocaleString()}원</h3>`;
  userProductsDiv.appendChild(overallDiv);
  document.getElementById('user-products-display').classList.remove('hidden');
}

/********************************************
 * 방 코드 생성 함수
 ********************************************/
function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
