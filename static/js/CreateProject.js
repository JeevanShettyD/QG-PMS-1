function calculateCableLength() {
  var arial1, arial2, arial3, arial4, ug1, ug2, ug3, ug4;
  arial1 = parseInt(document.getElementById("Air_Coax_Est").value);
  arial2 = parseInt(document.getElementById("Air_Coax_Act").value);
  arial3 = parseInt(document.getElementById("Air_Fib_Est").value);
  arial4 = parseInt(document.getElementById("Air_Fib_Act").value);
  ug1 = parseInt(document.getElementById("UG_Coax_Est").value);
  ug2 = parseInt(document.getElementById("UG_Coax_Act").value);
  ug3 = parseInt(document.getElementById("UG_Fib_Est").value);
  ug4 = parseInt(document.getElementById("UG_Fib_Act").value);
  document.getElementById("Total_Coax_Act").value = arial2 + ug2;
  document.getElementById("Total_Coax_Est").value = arial1 + ug1;
  document.getElementById("Total_Fib_Act").value = arial4 + ug4;
  document.getElementById("Total_Fib_Est").value = arial3 + ug3;
  document.getElementById("Total_Est").value = arial1 + arial3 + ug1 + ug3;
  document.getElementById("Total_Act").value = arial2 + arial4 + ug2 + ug4;
}
function getExtension(e) {
  const fileInput = document.getElementById(e.id);
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('NoteRefDoc', file);
  axios.post('/api/uploadNoteRefDoc', formData)
    .then(response => {
      document.getElementById(`attachmentLocation`).value = response.data;
      document.getElementById(`attachmentType`).value = e.files[0].name.split('.').pop();
    })
    .catch(error => {
      console.error(error);
      alert(error.response.data)

    })

}
if (document.getElementById("uploadCommentBtn")) {
  document.getElementById("uploadCommentBtn").addEventListener('click', (e) => {
    const Comment = document.getElementById("CommentInput").value.trim();
    const attachmentName = document.getElementById('attachmentLocation').value;
    const type = document.getElementById('attachmentType').value;

    if (Comment.length > 2) {
      var area = document.getElementById('NoteArea');
      area.innerHTML += `
      <div class="row border border-1">
            <div class="col-sm-1 align-self-center text-center">
              <p>1<p>
              <input type="hidden" name="location" id="location" value="${attachmentName}">
            </div>
            <div class="col-sm-10">
              <p>${Comment}</p>
             <input type='hidden' class='border-0 ' value='${Comment}' readonly>
            </div>
              ${(attachmentName !== null && attachmentName != undefined && attachmentName != "") ? `
              <div class="col-sm-1 align-self-center text-start">
              <a href="/public/uploads/ReferenceDoc/${attachmentName}" class="text-decoration-none btn btn-outline-secondary border-0" download><span id="type" class="text-uppercase">${type}
                </span><i class="bi bi-download"></i></a>
            </div>`: ``}
            <div class="col-sm-1 position-absolute end-0">
              <button type="button" id="ProfileCardCloseBtn"
                class="btn-close position-absolute top-0 end-0 m-1 border-0 rounded-circle btn-sm" onclick=removeNote(this)></button>
            </div>
          </div>`
      document.getElementById('attachmentLocation').value = ""
      document.getElementById("dialog-form").reset();
      updateSLNo();

    } else {
      document.getElementById('attachmentLocation').value = ""
      document.getElementById("dialog-form").reset();
    }
  })
}

function removeNote(e) {
  const container = document.getElementById('NoteArea');
  const inputs = container.querySelectorAll('div .row');
  if (inputs.length > 1) {
    e.closest('div .row').remove()
    updateSLNo();
  }

}
function updateSLNo() {
  const container = document.getElementById('NoteArea');
  const rows = container.querySelectorAll("div .row");
  rows.forEach((row, index) => {
    let cells = row.querySelectorAll('div')
    cells[0].getElementsByTagName('p')[0].innerText = index + 1;
    cells[0].getElementsByTagName('input')[0].id = `attachment${index + 1}`;
    cells[0].getElementsByTagName('input')[0].name = `attachment${index + 1}`;
    cells[1].getElementsByTagName('input')[0].id = `Note${index + 1}`;
    cells[1].getElementsByTagName('input')[0].name = `Note${index + 1}`;
  });
}
const commentDeleteBtn = document.querySelectorAll('.deleteBtn');
if(commentDeleteBtn.length){
  commentDeleteBtn.forEach(btn => btn.addEventListener("click", e => {
    e.target.setAttribute('disabled', '')
    const commentID = e.target.getAttribute('data-comment-id');
    const projectID = e.target.getAttribute('data-project-id');
    const Customer = e.target.getAttribute('data-Customer');
    axios.delete('/api/deleteComment', {
      data: {
        Customer:Customer,
        commentID: commentID,
        projectID: projectID
      }
  }).then(res => {
    window.location.reload();
    console.log(res)
  }).catch(error => {
    console.log(error);
    e.target.removeAttribute('disabled')
  })
}));
}

if (document.getElementById('addCommentBtn')) {
  document.getElementById('addCommentBtn').addEventListener('click', (e) => {
    const Comment = document.getElementById("CommentInput").value.replace(/\r?\n/g,'<br/>');
    const attachmentName = document.getElementById('attachmentLocation').value;
    const idProjects = document.getElementById('idProjects').value;
    const Customer = document.getElementById('Customer').value;
    if (Comment.length > 1) {
      axios.post('/api/addComment', {
        params: {
          Customer:Customer,
          Comment: Comment,
          attachmentName: attachmentName,
          idProjects:idProjects
        }
      }).then(res => {
        console.log(res)
        window.location.reload();
      }).catch(error => {
        console.log(error)
      })
    } else {
      document.getElementById('attachmentLocation').value = ""
      document.getElementById("dialog-form").reset();
    }
  })
}