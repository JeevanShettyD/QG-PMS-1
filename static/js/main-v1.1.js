window.addEventListener("load", () => {
  const tooltipTriggerList = document.querySelectorAll(
    '[data-bs-toggle="tooltip"]'
  );
  const tooltipList = [...tooltipTriggerList].map(
    (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
  );
  var loader = document.getElementsByClassName("loader-container")[0];
  // console.log(loader)
  if (loader) {
    // loader.style.visibility = "hidden";
    loader.style.display = "none";
  }

  const notificationContainer = document.querySelector(
    ".notification-container"
  );
  if (notificationContainer) {
    notificationContainer.innerHTML = ` <div class="h-100 d-flex flex-column align-items-center justify-content-center" id=""> 
    <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;" role="status">
    <span class="visually-hidden">Loading...</span>
    </div>
    </div>`;
  }
  axios
    .get("/api/getNotification/")
    .then((res) => {
      const notificationArray = res.data;
      let count = notificationArray.reduce((acc, obj) => {
        if (obj["is_read"] === 0) {
          acc++;
        }
        return acc;
      }, 0);

      if (count) {
        document
          .querySelector(".notification_icon")
          .querySelector("span.visually-hidden").innerHTML =
          count > 99 ? "99+" : count;
        document
          .querySelector(".notification_icon")
          .querySelector("span.visually-hidden")
          .classList.remove("visually-hidden");
      }
      notificationContainer.innerHTML = null;
      if (notificationArray.length) {
        notificationArray.forEach((notification) => {
          notificationContainer.innerHTML += `<div class="notification p-2 m-1 bg-primary ${notification.is_read ? `bg-opacity-10` : `bg-opacity-25`
            }">
      <p class="text-star">${notification.message}</p>
      <p class="text-end m-0 p-0" style="font-size: 12px;">${notification.created_at
            } <button type="button" class="btn p-0 m-0"></button></p>
    </div>`;
        });
        notificationContainer.innerHTML += `<div class="text-center"><button type="button" class="btn btn-sm btn-outline-secondary" id="Clear-Notification-Btn" onclick="Clear_Notification()">Clear all Notification</button></div>`;
      } else {
        notificationContainer.innerHTML += `<div class="d-flex flex-column align-items-center justify-content-center"
    id="">
    <img src="../../../static/images/Notification.svg"
        alt="Image" width="300"
        height="300"
        id="DataReportIcon">
        <p>You currently do not have any notifications.</p>
</div>`;
      }
    })
    .catch((e) => {
      console.log(e);
    });
});
$(document).ready(function () {
  if ($("from").length > 0) {
    $("form").bind("keypress", function (e) {
      if (e.keyCode == 13) {
        if ($(document.activeElement).is("textarea")) {
          return true;
        } else {
          return false;
        }
      }
    });
  }
});
$(".floating-btn").click(function () {
  $(".floating-container").toggleClass("slide-in");
});

var dropdown = document.getElementsByClassName("dropdown-btn");
var i;
for (i = 0; i < dropdown.length; i++) {
  dropdown[i].addEventListener("click", function () {
    this.classList.toggle("menu-active");
    var dropdownContent = this.nextElementSibling;
    if (dropdownContent.style.display === "block") {
      dropdownContent.style.display = "none";
    } else {
      dropdownContent.style.display = "block";
    }
  });
}

const profileIcon = document.querySelector(".profile_icon");
const profileCard = document.querySelector(".profile_card");
const closeBtn = document.getElementById("ProfileCardCloseBtn");
if (profileIcon) {
  profileIcon.addEventListener("click", () => {
    profileCard.classList.toggle("hidden");
    notification_card.classList.add("hidden");
  });
}
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    profileCard.classList.toggle("hidden");
  });
}

const notification_icon = document.querySelector(".notification_icon");
const notification_card = document.querySelector(".notification_card");
const NotificationCardCloseBtn = document.getElementById(
  "NotificationCardCloseBtn"
);
if (notification_icon) {
  notification_icon.addEventListener("click", () => {
    notification_card.classList.toggle("hidden");
    profileCard.classList.add("hidden");
  });
}
if (NotificationCardCloseBtn) {
  NotificationCardCloseBtn.addEventListener("click", () => {
    notification_card.classList.toggle("hidden");
  });
}

setInterval(function () {
  var datetime = new Date();
  const options = {
    month: "2-digit", // MM
    day: "2-digit", // DD
    year: "numeric", // YYYY
    hour: "2-digit", // HH
    minute: "2-digit", // MM
    second: "2-digit", // SS
    hour12: true, // Use 24-hour format
  };
  var datetimeString = datetime.toLocaleString("en-US", options);
  if (document.getElementById("date-time-label")) {
    document.getElementById("date-time-label").innerHTML =
      datetimeString.replaceAll("/", "-");
  }
}, 1000);
function Clear_Notification() {
  const Clear_Notification_Btn = document.getElementById(
    "Clear-Notification-Btn"
  );
  Clear_Notification_Btn.innerHTML = `<div class="d-flex justify-content-center">
          <div class="spinner-border" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>`;
  axios
    .post(`/api/markNotificationAsRead`)
    .then((res) => {
      Clear_Notification_Btn.classList.remove("btn-outline-secondary");
      Clear_Notification_Btn.classList.add("btn-outline-success");
      Clear_Notification_Btn.innerHTML = `Cleared <i class="bi bi-check2-circle"></i>`;
      document.querySelectorAll(".notification").forEach((notification) => {
        notification.classList.add("visually-hidden");
      });
      document
        .querySelector(".notification_icon")
        .querySelector("span").innerHTML = "0";
    })
    .catch((er) => {
      Clear_Notification_Btn.classList.remove("btn-outline-secondary");
      Clear_Notification_Btn.classList.add("btn-outline-danger");
      Clear_Notification_Btn.innerHTML = `Try Again <i class="bi bi-x-circle"></i>`;
    });
}
function sendPushNotification(message) {
  Notification.requestPermission().then((permission) => {
    new Notification("QGMPS", {
      body: message,
      icon: "../static/icons/QG-Logo.png",
    });
    if (permission === "denied") {
      Notification.requestPermission();
    }
  });
}
const popup = document.querySelector(".contactCard");
const ownerButtons = document.querySelectorAll(".Owner");
ownerButtons.forEach((button) => {
  button.addEventListener("click", handleMouseOver);
  button.addEventListener("mouseleave", handleMouseLeave);
});

function handleMouseOver(event) {
  const button = event.target;
  console.log(button.getAttribute("data-userID"));
  const rect = button.getBoundingClientRect();
  popup.style.top = `${rect.top + (rect.height - popup.clientHeight) / 2}px`;
  popup.style.left = `${rect.right}px`;
  popup.style.display = "block";
  popup.style.opacity = "1";

  axios
    .get(`/api/user`, {
      params: {
        UserId: button.getAttribute("data-userID"),
      },
    })
    .then((res) => {
      const userObj = new Object(res.data);
      const card = document.querySelector("#contactCard");
      for (let [key, value] of Object.entries(userObj)) {
        if (
          document.querySelector(`#contactCard #${key}`) &&
          key != "Profile"
        ) {
          document.querySelector(`#contactCard #${key}`).innerHTML = value
            ? value
            : "-";
        }
        if (key == "Profile") {
          document
            .querySelector(`#contactCard #${key}`)
            .setAttribute(
              "src",
              `../../../../public/uploads/Profile/${value ? value : "user.png"}`
            );
        }
      }
    })
    .catch((e) => {
      console.log(e);
    });
}

// Function to handle mouse leave event
function handleMouseLeave() {
  popup.style.opacity = "0";
  setTimeout(() => {
    popup.style.display = "none";
  }, 300);
}
function toggleAPILoader() {
  let loader = document.querySelector(".load-wrapp");
  if (loader) {
    loader.classList.toggle("visually-hidden");
  }
}
window.addEventListener("DOMContentLoaded", (event) => {
  // Get all elements with the specified class names
  const userInfoSpans = document.querySelectorAll(".user-info");
  const toggleButtons = document.querySelectorAll(".toggle-button");
  const selectLists = document.querySelectorAll(".select-list");
  const reset_btns = document.querySelectorAll(".reset-btn");
  // Add event listeners to each toggle button
  toggleButtons.forEach((toggleButton, index) => {
    // Add click event listener to toggle button
    toggleButton.addEventListener("click", function (event) {
      // Toggle visibility of elements with animation
      toggleElementWithAnimation(userInfoSpans[index]);
      toggleElementWithAnimation(selectLists[index]);
      toggleElementWithAnimation(toggleButtons[index]);
      toggleElementWithAnimation(reset_btns[index]);
    });
  });
  // Add event listeners to each toggle button
  reset_btns.forEach((reset_btn, index) => {
    // Add click event listener to toggle button
    reset_btn.addEventListener("click", function (event) {
      // Toggle visibility of elements with animation
      toggleElementWithAnimation(userInfoSpans[index]);
      toggleElementWithAnimation(selectLists[index]);
      toggleElementWithAnimation(toggleButtons[index]);
      toggleElementWithAnimation(reset_btns[index]);
    });
  });

  var today = new Date().toISOString().split("T")[0]; // Get today's date in YYYY-MM-DD format

  // Get all date inputs with the class 'today-date'
  var dateInputs = document.querySelectorAll('input[type="date"].today-date');

  // Set the 'min' attribute for each date input
  dateInputs.forEach(function (input) {
    input.setAttribute("min", today);
  });
  var maxToady = document.querySelectorAll('input[type="date"].max-today');

  // Set the 'max' attribute for each date input
  maxToady.forEach(function (input) {
    input.setAttribute("max", today);
  });

  // For month selector set max to current month
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");
  const currentYear = new Date().getFullYear();
  var maxThisMonth = document.querySelectorAll('input[type="month"].max-this-month');
  maxThisMonth.forEach(function (input) {
    input.setAttribute("max", `${currentYear}-${currentMonth}`);
  });
  // Add change event listener to each select list
  selectLists.forEach((selectList) => {
    selectList.addEventListener("change", function (event) {
      if (
        event.target.tagName.toLowerCase() === "select" &&
        event.target.dataset.ownerfor
      ) {
        toggleAPILoader();
        axios
          .post("/api/UpdateOwner", {
            Target: selectList.getAttribute("data-OwnerFor"),
            ID: selectList.getAttribute("data-ID"),
            NewOwner: selectList.value,
          })
          .then((res) => {
            window.location.reload();
          })
          .catch((error) => {
            console.log(error);
          })
          .finally(() => {
            toggleAPILoader();
          });
      } else if (
        event.target.tagName.toLowerCase() === "input" ||
        (event.target.tagName.toLowerCase() === "select" &&
          (event.target.dataset.target == "Milestone" ||
            event.target.dataset.target == "Task"))
      ) {
        toggleAPILoader();
        axios
          .post("/api/UpdateDueDate", {
            Target: selectList.getAttribute("data-Target"),
            ID: selectList.getAttribute("data-ID"),
            newDate: selectList.value,
            field: selectList.getAttribute("Name"),
          })
          .then((res) => {
            window.location.reload();
          })
          .catch((error) => {
            window.location.reload();
            console.log(error);
          })
          .finally(() => {
            toggleAPILoader();
          });
      }
    });
  });

  // Function to toggle element visibility with animation
  function toggleElementWithAnimation(element) {
    // Toggle element visibility and apply animation class
    element ? element.classList.toggle("hidden") : null;
  }

  let loc = window.location.pathname;
  $(".dropdown-menu")
    .find("a")
    .each(function () {
      $(this).toggleClass("active_menu", $(this).attr("href") == loc);
    });
  if (document.getElementById("searchbox")) {
    document
      .getElementById("searchbox")
      .addEventListener("keydown", function (e) {
        if (e.code == "Tab") {
          e.preventDefault();
        }
      });
  }
});

// Get the scroll buttons
document.addEventListener("DOMContentLoaded", () => {
  let containers = document.querySelectorAll(".scrollableContainer");
  containers.forEach((container) => {
    const topButton = container.querySelector(".topBtn");
    const bottomButton = container.querySelector(".bottomBtn");
    if (container && topButton && bottomButton) {
      // Show or hide the scroll buttons based on the scroll position
      container.addEventListener("scroll", function () {
        if (container.scrollTop > 20) {
          topButton.style.display = "block";
        } else {
          topButton.style.display = "none";
        }
        if (
          container.scrollHeight - container.scrollTop ===
          container.clientHeight
        ) {
          bottomButton.style.display = "none";
        } else {
          bottomButton.style.display = "block";
        }
      });
      // Initial check to show or hide the buttons
      if (container.scrollTop > 20) {
        topButton.style.display = "block";
      } else {
        topButton.style.display = "none";
      }
      if (
        container.scrollHeight - container.scrollTop ===
        container.clientHeight
      ) {
        bottomButton.style.display = "none";
      } else {
        bottomButton.style.display = "block";
      }

      // Scroll to top function
      topButton.addEventListener("click", () => {
        container.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      });

      // Scroll to bottom function
      bottomButton.addEventListener("click", () => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  });
});

function getUrlParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const params = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return params;
}
$("#searchbox").on("focus", function () {
  $("#searchResultsContainer").removeClass("visually-hidden");
});
$("#searchResultsContainer").on("drag", function () {
  $("#searchResultsContainer").addClass("visually-hidden");
});
$("#searchbox").on("blur", function (e) {
  if ($("#searchbox").val()) {
    if (
      e.target.parentNode
        .querySelector("#searchResultsContainer")
        .querySelectorAll(".searchList").length
    ) {
      $("#searchResultsContainer").removeClass("visually-hidden");
    } else {
      $("#searchResultsContainer").addClass("visually-hidden");
    }
  } else {
    $("#searchResultsContainer").addClass("visually-hidden");
  }
});
// Hide results when clicking outside of the search box and results container
$(document).on("click", function (event) {
  if (
    !$(event.target).closest(
      "#searchResultsContainer",
      "#searchbox",
      ".searchList"
    ).length
  ) {
    $("#searchResultsContainer").addClass("visually-hidden");
  }
});

// Prevent hiding when clicking within the search box
$("#searchbox").on("click", function (event) {
  event.stopPropagation();
});

$("#searchbox").on("keyup", function (event) {
  if (event.key == "Enter" && event.target.value.trim().length > 1) {
    const searchTerm = event.target.value.trim();
    const container = document.getElementById("searchResultsContainer");
    container.style.display = "block";
    container.innerHTML = `<div class="d-flex justify-content-center">
  <div class="spinner-border text-primary" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>
</div>
`;
    axios
      .get("/api/SearchData", {
        params: {
          searchTerm: searchTerm,
        },
      })
      .then((res) => {
        const data = res.data.result;
        container.innerHTML = null;
        if (data.length > 0) {
          let parsedData = data.map(JSON.parse);
          parsedData.forEach((project) => {
            for (const [key, value] of Object.entries(project)) {
              if (key == "Project") {
                let projectDiv = `  <a tabindex="-1" href="/Project/${value.Customer}/${value.ProjectID}/${value.idProjects}" class="searchList d-block fs-6 p-1 w-100 text-decoration-none text-dark" title="${value.Status}">   
                <p class="m-0 w-100 align-content-center"><i class="bi bi-folder-fill text-warning fs-4 d-inline"></i>  ${value.ProjectID}</p> 
              
                      <div class="text-truncate text-nowrap w-100">
                          <p class="text-body-tertiary fw-lighter m-0">${value.Customer}<span>-</span>${value.Status}</p>
                      </div>
                  </a>  `;
                container.innerHTML += projectDiv;
              }
              if (key == "Milestone") {
                let projectDiv = `  <a tabindex="-1" href="/ViewMilestone/${value.Customer}/${value.idProjects}/${value.Milestone_Name}" class="searchList d-block fs-6 p-1 w-100 text-decoration-none text-dark" title="${value.Status}">
                <p class="m-0 w-100 align-top"> <i class="bi bi-signpost-split text-info-emphasis fs-4 d-inline me-2"></i>${value.Milestone_Name}</p>
                      <div class="text-truncate text-nowrap w-100">
                          <p class="text-body-tertiary fw-lighter m-0">${value.Customer}<span>-</span>${value.Status}</p>
                      </div> </a>`;
                container.innerHTML += projectDiv;
              }
              if (key == "Task") {
                let projectDiv = `  <a tabindex="-1" href="/ViewTask/${value.Customer}/${value.Milestone_Name}/${value.TaskName}" class="searchList d-block fs-6 p-1 w-100 text-decoration-none text-dark" title="${value.Status}">
                <p class="m-0 w-100 align-top"> <i class="bi bi-list-ul text-info-emphasis fs-4 d-inline me-2"></i>${value.TaskName}</p>
                      <div class="text-truncate text-nowrap w-100">
                          <p class="text-body-tertiary fw-lighter m-0">${value.Customer}<span>-</span>${value.Status}</p>
                      </div> </a>`;
                container.innerHTML += projectDiv;
              }
              if (key == "SubTask") {
                let projectDiv = `  <a tabindex="-1" href="/SubTask/${value.SubTaskName}" class="searchList d-block fs-6 p-1 w-100 text-decoration-none text-dark" title="${value.Status}">
                <p class="m-0 w-100 align-top"> <i class="bi  bi-substack text-info-emphasis fs-4 d-inline me-2"></i>${value.SubTaskName}</p>
                      <div class="text-truncate text-nowrap w-100">
                          <p class="text-body-tertiary fw-lighter m-0">${value.Customer}<span>-</span>${value.Status}</p>
                      </div> </a>`;
                container.innerHTML += projectDiv;
              }
              if (key == "Markup") {
                let projectDiv = `  <a tabindex="-1" href="/Markup/${value.Sub_Task_Name}" class="searchList d-block fs-6 p-1 w-100 text-decoration-none text-dark" title="${value.Status}">
                <p class="m-0 w-100 align-top"> <i class="bi bi-pencil-fill text-info-emphasis fs-5 d-inline me-2"></i>${value.Sub_Task_Name}</p>
                      <div class="text-truncate text-nowrap w-100">
                          <p class="text-body-tertiary fw-lighter m-0">${value.Customer}<span>-</span>${value.Status}</p>
                      </div> </a>`;
                container.innerHTML += projectDiv;
              }
            }
          });
        } else {
          container.innerHTML =
            '<div class="d-flex text-center flex-row justify-content-center fs-6 align-items-center"><img width="30" height="30" src="https://img.icons8.com/ios/50/228BE6/nothing-found.png" alt="nothing-found"/> <p class="m-0">Not Found</p> </div>';
        }
      })
      .catch((er) => {
        console.log(er);
      });
  }
});
function secondsToMinutes(seconds) {
  if (isNaN(seconds)) {
    return "0.0";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${minutes}:${remainingSeconds < 10 ? "0" : ""
    }${remainingSeconds} min / ${hours}:${remainingMinutes < 10 ? "0" : ""
    }${remainingMinutes} hrs`;
}
function updateLabel(data) {
  if (document.getElementById(`TaskStatus-${data.TaskName}`)) {
    if (data.Active) {
      document
        .getElementById(`TaskStatus-${data.TaskName}`)
        .setAttribute("src", "../../../static/icons/Green-dot.png");
    } else {
      document
        .getElementById(`TaskStatus-${data.TaskName}`)
        .setAttribute("src", "../../../static/icons/Red-dot.png");
    }
  }
}
function UpdateMilestoneStatus(data) {
  if (document.getElementById(`MilestoneStatus-${data.Milestone_Name}`)) {
    if (data.Active) {
      document
        .getElementById(`MilestoneStatus-${data.Milestone_Name}`)
        .setAttribute("src", "../../../static/icons/Green-dot.png");
    } else {
      document
        .getElementById(`MilestoneStatus-${data.Milestone_Name}`)
        .setAttribute("src", "../../../static/icons/Red-dot.png");
    }
  }
}
function UpdateProjectStatus(data) {
  if (document.getElementById(`ProjectStatus-${data.Project_ID}`)) {
    if (data.Active) {
      document
        .getElementById(`ProjectStatus-${data.Project_ID}`)
        .setAttribute("src", "../../../static/icons/Green-dot.png");
    } else {
      document
        .getElementById(`ProjectStatus-${data.Project_ID}`)
        .setAttribute("src", "../../../static/icons/Red-dot.png");
    }
  }
}

function updateActiveTask(data) {
  const table = document.getElementById("activeTaskTable");
  if (table) {
    const body = table.getElementsByTagName("tbody");
    body[0].innerHTML = null;
    let slNO = 1;
    if (data.result.length) {
      data.result.forEach((task) => {
        if (
          !(task.TaskID.startsWith("SUB") || task.TaskID.startsWith("MKUP"))
        ) {
          body[0].innerHTML += `<tr>
          <td class="p-1">
              ${slNO}
          </td>
          <td class="p-1">
          ${task.Full_Name}
          </td>
          <td class="p-1">
              <a href="/ViewTask/${data.Customer ? data.Customer : task.Customer
            }/${task.Milestone_Name}/${task.TaskID}"> ${task.TaskID}</a>
          </td>
          <td class="p-1">
               ${task.Label}
          </td>
          <td class="p-1">
              ${task.Milestone_Name}
          </td>
          <td class="text-nowrap p-1">
          ${task.startTime}
          </td>
          <td class="text-nowrap p-1">
               ${secondsToMinutes(task.Duration)}
          </td>
      </tr>`;
        } else if (task.TaskID.startsWith("SUB")) {
          body[0].innerHTML += `<tr>
        <td class="p-1">
            ${slNO}
        </td>
        <td class="p-1">
        ${task.Full_Name}
        </td>
        <td class="p-1">
            <a href="/SubTask/${task.TaskID}"> ${task.TaskID}</a>
        </td>
        <td class="p-1">
             ${task.Label}
        </td>
        <td class="p-1">
            ${task.Milestone_Name}
        </td>
        <td class="text-nowrap p-1">
        ${task.startTime}
        </td>
        <td class="text-nowrap p-1">
             ${secondsToMinutes(task.Duration)}
        </td>
    </tr>`;
        } else if (task.TaskID.startsWith("MKUP")) {
          body[0].innerHTML += `<tr>
        <td class="p-1">
            ${slNO}
        </td>
        <td class="p-1">
        ${task.Full_Name}
        </td>
        <td class="p-1">
            <a href="/Markup/${task.TaskID}"> ${task.TaskID}</a>
        </td>
        <td class="p-1">
             ${task.Label}
        </td>
        <td class="p-1">
            ${task.Milestone_Name}
        </td>
        <td class="text-nowra p-1">
        ${task.startTime}
        </td>
        <td class="text-nowrap p-1">
             ${secondsToMinutes(task.Duration)}
        </td>
    </tr>`;
        }
        slNO++;
      });
    } else {
      body[0].innerHTML += `<tr>
       <td colspan="7" class="text-center">No Active Task</td>
       </tr>`;
    }
  }
}
function updateMasterActiveTask(data) {
  const table = document.getElementById("MasterActiveTaskTable");
  if (table) {
    const body = table.getElementsByTagName("tbody");
    body[0].innerHTML = null;
    let slNO = 1;
    if (data.result.length) {
      data.result.forEach((task) => {
        if (
          !(task.TaskID.startsWith("SUB") || task.TaskID.startsWith("MKUP"))
        ) {
          body[0].innerHTML += `<tr>
          <td>
              ${slNO}
          </td>
          <td>
          ${task.Full_Name}
          </td>
          <td>
              <a href="/ViewTask/${task.Customer}/${task.Milestone_Name}/${task.TaskID
            }"> ${task.TaskID}</a>
          </td>
          <td>
               ${task.Label}
          </td>
          <td>
              ${task.Milestone_Name}
          </td>
          <td class="text-nowrap">
          ${task.startTime}
          </td>
          <td class="text-nowrap">
               ${secondsToMinutes(task.Duration)}
          </td>
      </tr>`;
        } else if (task.TaskID.startsWith("SUB")) {
          body[0].innerHTML += `<tr>
        <td>
            ${slNO}
        </td>
        <td>
        ${task.Full_Name}
        </td>
        <td>
            <a href="/SubTask/${task.TaskID}"> ${task.TaskID}</a>
        </td>
        <td>
             ${task.Label}
        </td>
        <td>
            ${task.Milestone_Name}
        </td>
        <td class="text-nowrap">
        ${task.startTime}
        </td>
        <td class="text-nowrap">
             ${secondsToMinutes(task.Duration)}
        </td>
    </tr>`;
        } else if (task.TaskID.startsWith("MKUP")) {
          body[0].innerHTML += `<tr>
        <td>
            ${slNO}
        </td>
        <td>
        ${task.Full_Name}
        </td>
        <td>
            <a href="/Markup/${task.TaskID}"> ${task.TaskID}</a>
        </td>
        <td>
             ${task.Label}
        </td>
        <td>
            ${task.Milestone_Name}
        </td>
        <td class="text-nowrap">
        ${task.startTime}
        </td>
        <td class="text-nowrap">
             ${secondsToMinutes(task.Duration)}
        </td>
    </tr>`;
        }
        slNO++;
      });
    } else {
      body[0].innerHTML += `<tr>
       <td colspan="7" class="text-center">No Active Task</td>
       </tr>`;
    }
  }
}
async function updateAttachments(Column, Value, Owner) {
  const body = document
    .getElementById("AttachmentsTable")
    .getElementsByTagName("tbody")[0];
  body.innerHTML =
    '<tr class="text-center"><td colspan="9"><div class="spinner-border text-primary" role="status"></div><td></tr>';
  axios
    .get("/api/getAttachments", { params: { Target: Column, Value: Value } })
    .then((result) => {
      body.innerHTML = null;
      result.data.forEach((attachments, index) => {
        body.innerHTML += `<tr class="text-center">
          <td>${index + 1}</td>
          <td class="w-25"><a href="../../..${attachments.path
          }" target="_blank"><p class="m-0 text-start text-truncate w-75" title="${attachments.Name
          }">${attachments.Name}</p></a></td>
          <td>${attachments.Created_Date}</td>
          <td>${attachments.Size} mb</td>
          <td><img width="25" height="25" src="/static/icons/${attachments.Type.substring(
            1
          )}.png" alt="${attachments.Type}"/></td>
          <td>${attachments.Full_Name}</td>
          <td>
              <i class="bi bi-trash3-fill text-secondary archive-btn fs-6 ${attachments.Owner != Owner ? "visually-hidden" : ""
          }"  data-fileID="${attachments.idattachments}"></i>
          </td>
          </tr>`;
      });
      syncArchiveButton();
    })
    .catch((er) => {
      console.log(er);
    });
}

function syncArchiveButton() {
  const archiveBtns = document.querySelectorAll(".archive-btn");
  archiveBtns.forEach((archiveBtn) => {
    archiveBtn.addEventListener("click", (e) => {
      const ID = e.target.getAttribute("data-fileID");
      if (ID) {
        axios
          .delete("/api/DocumentCenter/delete", { data: { FileID: ID } })
          .then((res) => {
            e.target.parentElement.parentElement.remove();
            window.location.reload();
            //toasts.push(res.data)
          })
          .catch((er) => {
            console.log(er);
            toasts.push(er.response.data);
          });
      }
    });
  });
}
$("#AttachmentDialog").on("hidden.bs.modal", function () {
  document.getElementById("filelist").innerHTML =
    '<li class="text-center list-group-item">No file has been selected</li>';
  //uploader.clearQueue()
});
$("#FinalUploader_filelist").on("hidden.bs.modal", function () {
  //FinalUploader.clearQueue()
  document.getElementById("Final_filelist").innerHTML =
    '<li class="text-center list-group-item">No file has been selected</li>';
});
let filesQueue = [];
let successLength = 0;
let fileList = document.getElementById("filelist");
function removeFile(fileId) {
  $("#startUpload").attr("disabled", false);
  const fileIndex = filesQueue.findIndex((f) => f.fileId === fileId);
  if (fileIndex !== -1) {
    filesQueue.splice(fileIndex, 1);
    document.getElementById(fileId).remove();
  }
  if (filesQueue.length === 0) {
    document.getElementById("fileInput").value = "";
    document.getElementById("filelist").innerHTML =
      '<li class="text-center list-group-item">No file has been selected</li>';
    $("#startUpload").fadeOut("slow");
    $("#startUpload").attr("disabled", true);
  }
}

$(document).ready(function () {
  $("#startUpload").fadeOut("slow");
  $("#FinalUploader-start-upload").fadeOut("slow");
  syncArchiveButton();
  if (document.getElementById("fileInput")) {
    document
      .getElementById("fileInput")
      .addEventListener("change", handleFileSelect);
    document
      .getElementById("startUpload")
      .addEventListener("click", startUpload);
  }

  if (document.getElementById("startUpload2")) {
    document
      .getElementById("fileInput2")
      .addEventListener("change", handleFileSelect);
    document
      .getElementById("startUpload2")
      .addEventListener("click", startUpload);
  }

  function handleFileSelect(event) {
    filesQueue.length = 0;
    successLength = 0;
    const files = event.target.files;
    fileList.innerHTML = "";
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = generateUniqueId();
      filesQueue.push({ file, fileId });
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      fileList.innerHTML +=
        '<li class="position-relative d-flex justify-content-between bg-gradient bg-opacity-50 list-group-item list-group-item-action my-1 px-2 rounded" id="' +
        fileId +
        '"><span class="w-50 text-truncate">' +
        file.name +
        '</span><span class="px-2">' +
        fileSizeMB +
        ".MB</span>" +
        '<div class="px-1"><progress id="file-progress-' +
        fileId +
        '" value="0" max="100"></progress>' +
        '<label class="px-1" for="file-progress-' +
        fileId +
        '">0% </label>' +
        '<div class="spinner-border spinner-border-sm visually-hidden" role="status" id="Loading-' +
        fileId +
        '"></div> <button id="Close-' +
        fileId +
        '" class="btn-close btn-sm" aria-label="Close" onclick="removeFile(\'' +
        fileId +
        "')\"></button></div>" +
        "</li>";
    }
    if (filesQueue.length > 0) {
      $("#startUpload").fadeIn("slow");
      $("#startUpload2").fadeIn("slow");
      $("#startUpload").attr("disabled", false);
      $("#startUpload2").attr("disabled", false);
      $("#AttachmentDialog .modal-close-btn").prop("disabled", false);
      $("#FinalUploaderAttachmentDialog .modal-close-btn").prop(
        "disabled",
        false
      );
    } else {
      $("#startUpload").fadeOut("slow");
      $("#startUpload").attr("disabled", true);
      $("#startUpload2").fadeOut("slow");
      $("#startUpload2").attr("disabled", true);
      document.getElementById("fileInput").value = "";
      document.getElementById("fileInput2").value = "";
    }
  }
  function generateUniqueId() {
    return Math.random().toString(36).substr(2, 9);
  }

  async function startUpload() {
    $("#startUpload").attr("disabled", true);
    $("#startUpload2").attr("disabled", true);
    $("#AttachmentDialog .modal-close-btn").prop("disabled", true);
    $("#FinalUploaderAttachmentDialog .modal-close-btn").prop("disabled", true);
    for (const fileObj of filesQueue) {
      await uploadFile(fileObj.file, fileObj.fileId);
    }
    $("#AttachmentDialog .modal-close-btn").prop("disabled", false);
    $("#FinalUploaderAttachmentDialog .modal-close-btn").prop(
      "disabled",
      false
    );
  }

  async function uploadFile(file, fileId) {
    document.getElementById("fileInput").value = "";
    document.getElementById("Close-" + fileId).classList.add("visually-hidden");
    document
      .getElementById("Loading-" + fileId)
      .classList.remove("visually-hidden");
    let formData = new FormData();
    formData.append("file", file);
    try {
      const response = await axios.post("/api/DocumentCenter", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: function (progressEvent) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          document.querySelector(
            "label[for=file-progress-" + fileId + "]"
          ).innerHTML = percentCompleted + "%";
          document.getElementById("file-progress-" + fileId).value =
            percentCompleted;
        },
      });

      if (response.status === 200) {
        successLength++;
        const serverFileId = fileId;
        document
          .getElementById("Loading-" + fileId)
          .classList.add("visually-hidden");
        document.getElementById(fileId).classList.add("upload-success");
        console.log(`File uploaded successfully with ID: ${serverFileId}`);
        document
          .getElementById(serverFileId)
          .classList.add("bg-success-subtle");
        document
          .getElementById("Close-" + serverFileId)
          .classList.add("visually-hidden");
        document.querySelector(
          "label[for=file-progress-" + serverFileId + "]"
        ).innerHTML += '<i class="ms-2 bi bi-check-circle-fill"></i>';
      }
    } catch (error) {
      let message = "Internal Server Error";
      if ((error.code = "ERR_NETWORK")) {
        message = "File already exist with same name";
      }
      console.log(error);
      document
        .getElementById("Loading-" + fileId)
        .classList.add("visually-hidden");
      document.getElementById(fileId).classList.add("bg-danger-subtle");
      document.querySelector(
        "label[for=file-progress-" + fileId + "]"
      ).innerHTML =
        0 +
        `% <i class="bi bi-exclamation-circle-fill" data-bs-toggle="tooltip" data-bs-title='${message}'></i>`;
      document.getElementById("file-progress-" + fileId).value = 0;
      const tooltipTriggerList = document.querySelectorAll(
        '[data-bs-toggle="tooltip"]'
      );
      const tooltipList = [...tooltipTriggerList].map(
        (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
      );
    }
    if (filesQueue.length == successLength) {
      window.location.reload();
    }
  }
});
$("#AttachmentDialog").on("hidden.bs.modal", function () {
  document.getElementById("fileInput").value = "";
  filesQueue.length = 0;
  successLength = 0;
  $("#startUpload").prop("disabled", false);
});

document.addEventListener("DOMContentLoaded", function () {
  // Check if there's a stored active tab
  var activeTab = localStorage.getItem("activeTab");
  if (activeTab) {
    var tabElement = document.querySelector(
      '[data-bs-target="' + activeTab + '"]'
    );
    if (tabElement) {
      var tab = new bootstrap.Tab(tabElement);
      tab.show();
    }
  }

  // Store the active tab when it is clicked
  document
    .querySelectorAll('button[data-bs-toggle="tab"]')
    .forEach(function (tab) {
      tab.addEventListener("shown.bs.tab", function (e) {
        localStorage.setItem(
          "activeTab",
          e.target.getAttribute("data-bs-target")
        );
      });
    });
});
let elapseTiming = 0;
let globalStartTime = 0;
let globalTimerInterval;
const globalDisplay = document.getElementById("globalDisplay");
const globalStopBtn = document.getElementById("globalStopBtn");
function globalStart(TaskID) {
  globalStartTime = Date.now() - elapseTiming;
  globalTimerInterval = setInterval(globalUpdateDisplay, 100);
  globalStopBtn.disabled = false;
  globalStopBtn.setAttribute("data-id", TaskID);
  globalStopBtn.classList.remove("d-none");
}
function globalStop() {
  clearInterval(globalTimerInterval);
  elapseTiming = 0;
  globalDisplay.textContent = "00:00:00:00";
  globalStopBtn.disabled = true;
  globalStopBtn.classList.add("d-none");
}
function globalUpdateDisplay() {
  elapseTiming = Date.now() - globalStartTime;
  globalDisplay.style.opacity = 0;
  globalDisplay.textContent = globalFormatTime(elapseTiming);
  globalDisplay.style.opacity = 1;
}
function globalFormatTime(time) {
  var date = new Date(time);
  var minutes = date.getUTCMinutes();
  var seconds = date.getUTCSeconds();
  var milliseconds = Math.floor(date.getUTCMilliseconds() / 10);
  var hours = date.getUTCHours();
  hours = hours < 10 ? "0" + hours : hours;
  minutes = minutes < 10 ? "0" + minutes : minutes;
  seconds = seconds < 10 ? "0" + seconds : seconds;
  milliseconds = milliseconds < 10 ? "0" + milliseconds : milliseconds;
  return hours + ":" + minutes + ":" + seconds + ":" + milliseconds;
}
document.addEventListener("DOMContentLoaded", function () {
  syncArchiveButton();
  const selectAllCheckbox = document.getElementById("selectAll");
  const recordCheckboxes = document.querySelectorAll(".record-checkbox");
  const selectedRecords = [];
  function updateSelectedRecords() {
    selectedRecords.length = 0; // Clear the array
    recordCheckboxes.forEach((checkbox) => {
      if (checkbox.checked) {
        selectedRecords.push(checkbox.value);
      }
    });
    if (selectedRecords.length == 0) {
      document.getElementById("zipDownload").classList.add("visually-hidden");
    } else {
      document
        .getElementById("zipDownload")
        .classList.remove("visually-hidden");
    }
  }
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", function () {
      const isChecked = this.checked;
      recordCheckboxes.forEach((checkbox) => {
        checkbox.checked = isChecked;
      });
      updateSelectedRecords();
    });
  }
  if (recordCheckboxes) {
    recordCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", function () {
        if (!this.checked) {
          selectAllCheckbox ? (selectAllCheckbox.checked = false) : null;
        } else {
          // Check if all record checkboxes are checked
          let allChecked = true;
          recordCheckboxes.forEach((checkbox) => {
            if (!checkbox.checked) {
              allChecked = false;
            }
          });
          if (allChecked) {
            selectAllCheckbox ? (selectAllCheckbox.checked = true) : null;
          }
        }
        updateSelectedRecords();
      });
    });
  }
  if (document.getElementById("zipDownload")) {
    document.getElementById("zipDownload").addEventListener("click", (e) => {
      console.log(e.target.parentElement.attributes);
      let FileName =
        e.target.parentElement.attributes["data-filename"].nodeValue;
      FileName = FileName ? FileName : "QGPMS-Attachments";
      if (selectedRecords.length) {
        axios
          .post(
            "/api/DocumentCenter/download",
            { params: { FileID: selectedRecords } },
            { responseType: "blob" }
          )
          .then((res) => {
            const url = window.URL.createObjectURL(
              new Blob([res.data], { type: "application/zip" })
            );
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `${FileName}.zip`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          })
          .catch((er) => {
            console.log(er);
          });
      }
    });
  }
  if (document.getElementById("OngoingTaskInfo")) {
    fetch("/api/getPendingTask")
      .then((res) => res.json())
      .then((result) => {
        if (result.TaskInfo) {
          let pendingTask = result.TaskInfo;
          document
            .getElementById("OngoingTaskInfo")
            .classList.remove("visually-hidden");
          let taskName = result["Timmer Info"][0].TaskName;
          elapseTiming =
            Date.now() - new Date(result["Timmer Info"][0].startTime);
          globalStart(taskName);
          let URL = "#";
          document.getElementById("TaskName").innerText = taskName;
          if (taskName.startsWith("SUB")) {
            URL = "/SubTask/" + taskName;
          } else if (taskName.startsWith("MKUP")) {
            URl = "/Markup/" + taskName;
          } else {
            URL = `/ViewTask/${pendingTask.Customer}/${pendingTask.Milestone_Name}/${pendingTask.TaskName}`;
          }
          document
            .getElementById("globalRedirectLink")
            .setAttribute("href", URL);
        } else {
          document
            .getElementById("OngoingTaskInfo")
            .classList.add("visually-hidden");
        }
      })
      .catch((er) => {
        console.log(er);
        document
          .getElementById("OngoingTaskInfo")
          .classList.add("visually-hidden");
      });
  }

  document.getElementById("globalStopBtn").addEventListener("click", (e) => {
    globalStop(e.target);
    $("#globalStopBtn").prop("disabled", true);
    axios
      .post(`/api/updateTimeLog/${e.target.parentNode.dataset.id}/stop`)
      .then((res) => {
        window.location.reload();
      })
      .catch((e) => {
        console.log(e);
        if (e.response.data == "Access Denied") {
          alert("Your session got closed.Login again to continue");
        } else {
          alert("Unable to stop the Timer. Try again...!");
          window.location.reload();
        }
      });
  });
});
/* suppress default behavior for drag and drop events */
function suppress(e) {
  e.stopPropagation();
  e.preventDefault();
}
function areArraysEqual(arr1, arr2) {
  return arr1.length === arr2.length &&
    arr1.every((value, index) => value === arr2[index]);
}
const WorkDoneUpdateHeader = [
  "WD Reference ID",
  "Customer",
  "Project Name",
  "Job ID",
  "Region",
  "SOW",
  "Labor Code",
  "Total Quantity",
  "Accounted in Month",
  "isMovedToEstimate"
];
const WorkDoneUpdateHeaderHOD = [
  "WD Reference ID",
  "Customer",
  "Project Name",
  "Job ID",
  "Region",
  "SOW",
  "Labor Code",
  "Total Quantity",
  "Unit Price",
  "Total Revenue",
  "Accounted in Month",
  "isMovedToEstimate"
];
const WorkDoneImportHeader = [
  "Customer",
  "Program",
  "Job_ID",
  "SOW",
  "Region",
  "Item",
  "Quantity",
  "Accounted Month"
]
const estimatesImportHeader = [
  "Customer",
  "Program",
  "Job_ID",
  "SOW",
  "Region",
  "Item",
  "Quantity",
  "Status",
  "ApprovedDate",
  "Invoiced Date",
  "Invoice Number",
  "Amount Received",
  "Payment Received Date",
  "Rejected Date",
  "Rejection Comment"
]
async function handleDropAsync(e, target) {
  suppress(e);
  const f = e.target.files[0];
  /* get raw data */
  const data = await f.arrayBuffer();
  /* data is an ArrayBuffer */
  const wb = XLSX.read(data);

  let json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
  });
  console.log(target.getAttribute("id"));
  console.log(json[0]);
  let isSameTemplate = false;
  let dateColumns = [7, 8, 9, 13, 15, 16, 17, 18];
  if (target.getAttribute("id") == "excelImportTable") {
    dateColumns = [8, 9, 12, 13];
    isSameTemplate = areArraysEqual(estimatesImportHeader, json[0]);
  }
  if (target.getAttribute("id") == "WD_excelTable") {
    dateColumns = [];
    isSameTemplate = (areArraysEqual(WorkDoneUpdateHeader, json[0]) || areArraysEqual(WorkDoneUpdateHeaderHOD, json[0]));
  }
  if (target.getAttribute("id") == "WD_excelImportTable") {
    dateColumns = [];
    isSameTemplate = areArraysEqual(WorkDoneImportHeader, json[0]);
  }
  if (!isSameTemplate) {
    alert("Invalid Template...")
    e.target.value = null;
    return;
  }
  json = json.map((row) =>
    row.map((cell, index) =>
      dateColumns.includes(index) && typeof cell === "number" && cell > 59
        ? excelDateToJSDate(cell)
        : cell
    )
  );
  const thead = target.querySelector("thead");
  const tbody = target.querySelector("tbody");

  // Clear previous content
  thead.innerHTML = "";
  tbody.innerHTML = "";
  let headerCount = 0;
  // Populate header
  if (json.length > 0) {
    document.getElementById("Estimates_Verify_Btn").removeAttribute("disabled");
    document.getElementById("Estimates_Import_Btn").removeAttribute("disabled");
    document.getElementById("WD_Upload_Btn").removeAttribute("disabled");
    document.getElementById("WD_Import_Btn").removeAttribute("disabled");
    json[0].splice(0, 0, "S.No");
    headerCount = json[0].length;
    const headerRow = document.createElement("tr");
    headerRow.classList.add("text-center");
    json[0].forEach((header) => {
      const th = document.createElement("th");
      th.classList.add("text-nowrap");
      th.textContent = header == "ApprovedDate" ? "Reserved Date" : header;
      headerRow.appendChild(th);
    });
    let th = document.createElement("th");
    th.textContent = "";
    headerRow.appendChild(th);
    th = document.createElement("th");
    th.textContent = "";
    headerRow.appendChild(th);
    thead.appendChild(headerRow);
  } else {
    document.getElementById("Estimates_Verify_Btn").setAttribute("disabled");
    document.getElementById("Estimates_Import_Btn").setAttribute("disabled");
    document.getElementById("WD_Upload_Btn").setAttribute("disabled");
    document.getElementById("WD_Import_Btn").setAttribute("disabled");
  }

  // Populate rows with unique IDs
  json.slice(1).forEach((row, index) => {
    // Check if the row is empty
    const isEmptyRow = row.every(
      (cell) => cell === undefined || cell === null || cell === ""
    );

    // Skip empty rows
    if (isEmptyRow) {
      return;
    }
    const tr = document.createElement("tr");
    let temp = (target.getAttribute("id") == "WD_excelImportTable" || target.getAttribute("id") == "WD_excelTable") ? "WD" : "estimate";
    tr.setAttribute("id", `${temp}_row-${index + 1}`);
    tr.classList.add("text-center");
    let sltd = document.createElement("td");
    sltd.textContent = index + 1;
    sltd.classList.add("text-nowrap", "p-1", "align-content-center");
    tr.appendChild(sltd);
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell !== undefined ? cell : "";
      td.classList.add("text-nowrap", "p-1", "align-content-center");
      tr.appendChild(td);
    });
    const cellCount = row.length;
    if (cellCount < headerCount) {
      for (let index = 0; index < headerCount - cellCount; index++) {
        const td = document.createElement("td");
        td.textContent = "-";
        tr.appendChild(td);
      }
    }
    const td = document.createElement("td");
    td.innerHTML = `<button type="button" id="${temp}_row-${index + 1}-Message" class="btn btn-sm" data-bs-toggle="tooltip" data-bs-placement="right" data-bs-title="Tooltip on right"><i class="bi bi-info-circle-fill"></i></button>`;
    td.classList.add("text-nowrap");
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
}
async function handleDropsAsync(e, target) {
  suppress(e);
  const f = e.target.files[0];

  /* get raw data */
  const data = await f.arrayBuffer();
  const wb = XLSX.read(data);

  // Array of objects
  let json = XLSX.utils.sheet_to_json(
    wb.Sheets[wb.SheetNames[0]],
    { defval: "" }
  );
  const thead = target.querySelector("thead");
  const tbody = target.querySelector("tbody");

  thead.innerHTML = "";
  tbody.innerHTML = "";

  thead.classList.add("sticky-top", "z-1");

  if (json.length === 0) {
    document.getElementById("Estimates_Verify_Btn").setAttribute("disabled", true);
    document.getElementById("Estimates_Import_Btn").setAttribute("disabled", true);
    document.getElementById("WD_Import_Btn").setAttribute("disabled", true);
    return;
  }

  document.getElementById("Estimates_Verify_Btn").removeAttribute("disabled");
  document.getElementById("Estimates_Import_Btn").removeAttribute("disabled");
  document.getElementById("WD_Import_Btn").removeAttribute("disabled");

  /* ---------- HEADER ---------- */
  const headers = Object.keys(json[0]);
  const headerRow = document.createElement("tr");
  headerRow.classList.add("text-center",);

  const snTh = document.createElement("th");
  snTh.textContent = "S.No";
  headerRow.appendChild(snTh);

  headers.forEach((header) => {
    const th = document.createElement("th");
    th.classList.add("text-nowrap");
    th.textContent = header === "ApprovedDate" ? "Reserved Date" : header;
    headerRow.appendChild(th);
  });

  headerRow.appendChild(document.createElement("th"));
  thead.appendChild(headerRow);

  /* ---------- BODY ---------- */
  json.forEach((rowObj, rowIndex) => {
    const isEmptyRow = Object.values(rowObj).every(
      (cell) => cell === "" || cell === null
    );
    if (isEmptyRow) return;

    const tr = document.createElement("tr");
    const temp =
      target.getAttribute("id") === "WD_excelImportTable" ? "WD" : "estimate";

    tr.setAttribute("id", `${temp}_row-${rowIndex + 1}`);
    tr.classList.add("text-center");

    const sltd = document.createElement("td");
    sltd.textContent = rowIndex + 1;
    sltd.classList.add("text-nowrap", "p-1", "align-content-center");
    tr.appendChild(sltd);

    headers.forEach((key) => {
      let cell = rowObj[key];
      const td = document.createElement("td");

      if (
        dateFields.includes(key) &&
        typeof cell === "number" &&
        cell > 59
      ) {
        td.textContent = excelDateToJSDate(cell);
      } else {
        td.textContent = cell;
      }

      td.classList.add("text-nowrap", "p-1", "align-content-center");
      tr.appendChild(td);
    });

    const td = document.createElement("td");
    td.innerHTML = `
      <button type="button"
        id="${temp}_row-${rowIndex + 1}-Message"
        class="btn btn-sm"
        data-bs-toggle="tooltip"
        data-bs-placement="right"
        data-bs-title="Tooltip on right">
        <i class="bi bi-info-circle-fill"></i>
      </button>`;
    td.classList.add("text-nowrap");

    tr.appendChild(td);
    tbody.appendChild(tr);
  });
}

// For Estimates Upload
const EstimatesInput = document.getElementById("Estimates");
const EstimatesInputImport = document.getElementById("Estimates_Import");
const EstimatesVerify = document.getElementById("Estimates_Verify_Btn");
const EstimatesImport_Btn = document.getElementById("Estimates_Import_Btn");
const EstimatesCancel = document.getElementById("Estimates_Cancel_Btn");
const EstimatesImportCancel = document.getElementById("Estimates_Import_Cancel_Btn");
const ExcelTable = document.getElementById("excelTable");
const ExcelImportTable = document.getElementById("excelImportTable");
const estimateAttachmentsContainer = document.getElementById("estimateAttachmentsContainer");
const estimateTableContainer = document.getElementById("estimateTableContainer");
const invoiceAttachmentsBtn = document.getElementById("invoiceAttachmentsBtn");
const invoiceAttachmentsList = document.getElementsByClassName("invoiceAttachmentsList")[0];
// Estimates Upload File Input Change Event
if (EstimatesInput) {
  EstimatesInput.addEventListener("change", (e) =>
    handleDropsAsync(e, ExcelTable)
  );
}
if (EstimatesInputImport) {
  EstimatesInputImport.addEventListener(
    "change",
    (e) => handleDropAsync(e, ExcelImportTable),
    false
  );
}
if (EstimatesCancel) {
  EstimatesCancel.addEventListener("click", function (e) {
    EstimatesInput.value = null;
    ExcelTable.querySelector("thead").innerHTML = null;
    ExcelTable.querySelector("tbody").innerHTML = null;
  });
}
if (EstimatesImportCancel) {
  EstimatesImportCancel.addEventListener("click", function (e) {
    EstimatesInputImport.value = null;
    ExcelImportTable.querySelector("thead").innerHTML = null;
    ExcelImportTable.querySelector("tbody").innerHTML = null;
  });
}
// Function to convert Excel date numbers to readable dates
function excelDateToJSDate(excelDate, mysqlFormat = false) {
  const unixTimestamp = (excelDate - 25569) * 86400 * 1000;
  // return new Date(unixTimestamp).toISOString().slice(0, 10); // Format as YYYY-MM-DD
  const date = new Date(unixTimestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
  const day = String(date.getDate()).padStart(2, "0");
  // const year = String(date.getFullYear()).slice(-2); // Get the last two digits of the year
  const year = String(date.getFullYear())
  return mysqlFormat ? `${year}-${month}-${day}` : `${month}-${day}-${year}`;
}
function parseUSDate(dateStr) {
  if (!dateStr || dateStr === "-") return null;

  const [month, day, year] = dateStr.split("/").map(Number);

  // handle 2-digit year → 4-digit
  const fullYear = year < 50 ? 2000 + year : 1900 + year;

  return new Date(Date.UTC(fullYear, month - 1, day)).toISOString().split("T")[0];
}
const dateFields = [
  "Project Received Date",
  "Project Submitted Date",
  "Project Approved Date",
  "LC Reserved Date",
  "Invoice Date",
  "Payment Received Date",
  "Rejected Date",
];
let estimatesVerifiedData = null;
let isEstimatesVerified = false;
let invAttachmentRequiredList = [];
let alreadyTriggered = false;
// Verify & Update Estimates
if (EstimatesVerify) {
  EstimatesVerify.addEventListener("click", async function (e) {
    let f = EstimatesInput.files[0];
    let data = await f.arrayBuffer();
    let wb = XLSX.read(data);
    let temp = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      cellDates: true,
    });
    temp = temp.map((item, index) => {
      const data = { ...item };
      for (const field of dateFields) {
        data[field] = item[field] ? parseUSDate(item[field]) : null;
      }
      return {
        id: `estimate_row-${index + 1}`,
        data
      };
    });

    console.log("Temp JSON Data:");
    console.log(temp);
    EstimatesVerify.innerHTML = `
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
    <span role="status">Loading...</span>`;
    const action = isEstimatesVerified ? "upload" : "verify";
    console.log("Action:", action);
    temp = isEstimatesVerified ? estimatesVerifiedData : temp;
    const files = invoiceAttachmentsBtn.files;
    let estimatesFormData = new FormData();
    estimatesFormData.append("action", action);
    estimatesFormData.append("estData", JSON.stringify(temp));
    Array.from(files).forEach((file, index) => {
      estimatesFormData.append(`Invoices`, file);
    });
    document.getElementById("Upload_Success_Count").innerText = 0;
    document.getElementById("Upload_Failed_Count").innerText = 0;
    axios
      .post("/api/estimatesUpdate", estimatesFormData)
      .then((response) => {
        const { failed, success, skipped, invRequiredList } = response.data;
        invAttachmentRequiredList = invRequiredList;
        console.log("Response from server:");
        console.log(response.data);
        document.getElementById("Upload_Success_Count").innerText =
          success.length;
        document.getElementById("Upload_Failed_Count").innerText =
          failed.length + skipped.length;
        success.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-success-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .dataset.bsTitle = "Success";
          // .dataset.bsTitle = log.message;
          row.querySelector(`#${log.id}-Message`).innerHTML = `<i class="bi bi-check-circle"></i>`;
        });
        failed.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-danger-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .dataset.bsTitle = log.message;
          row.querySelector(`#${log.id}-Message`).innerHTML = `<i class="bi bi-exclamation-circle"></i>`;
        });
        skipped.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-warning-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .dataset.bsTitle = log.message;
          row.querySelector(`#${log.id}-Message`).innerHTML = `<i class="bi bi-exclamation-triangle"></i>`;
        });
        if (failed.length === 0) {
          isEstimatesVerified = true;
        }
        const tooltipTriggerList = document.querySelectorAll(
          '[data-bs-toggle="tooltip"]'
        );
        const tooltipList = [...tooltipTriggerList].map(
          (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
        );
        estimatesVerifiedData = temp.filter((item, index) => {
          return !failed.some((fail) => fail.id === `estimate_row-${index + 1}`);
        });
        invoiceAttachmentsList.querySelector(".container").innerHTML = "";
        // Generate Invoice Attachment List
        if (invRequiredList.length > 0 && action == "verify") {
          // Header row
          const headerRow = document.createElement("div");
          headerRow.className = "row fw-bold border-bottom  p-1 m-1 bg-secondary text-white";
          [
            "S.No",
            "Invoice Number",
            "Attachment Status"
          ].forEach(text => {
            const col = document.createElement("div");
            col.className = "col";
            col.textContent = text;
            headerRow.appendChild(col);
          });
          invoiceAttachmentsList.querySelector(".container").appendChild(headerRow);
          // Dynamic Invoice Columns
          invRequiredList.forEach((invoice, index) => {
            const row = document.createElement("div");
            row.className = "row align-items-center p-1 m-1 bg-light";
            // S.No
            const snoCol = document.createElement("div");
            snoCol.className = "col ";
            snoCol.textContent = index + 1;
            // Invoice Number
            const invoiceCol = document.createElement("div");
            invoiceCol.className = "col";
            invoiceCol.textContent = invoice;
            // Status
            const statusCol = document.createElement("div");
            statusCol.className = "col";

            const statusLabel = document.createElement("span");
            statusLabel.className = "badge text-bg-warning rounded-pill";
            statusLabel.textContent = "Pending";
            statusLabel.id = `invoice-status-${invoice.replace(/[^a-zA-Z0-9]/g, "")}`;
            statusCol.appendChild(statusLabel);

            row.append(snoCol, invoiceCol, statusCol);
            invoiceAttachmentsList.querySelector(".container").appendChild(row);
          });
          estimateTableContainer.classList.add("visually-hidden");
          estimateAttachmentsContainer.classList.remove("visually-hidden");
          EstimatesVerify.innerHTML = `<span role="status">Upload <i class="bi bi-cloud-check"></i></span>`;
        }
        else {
          estimateTableContainer.classList.remove("visually-hidden");
          estimateAttachmentsContainer.classList.add("visually-hidden");
          EstimatesVerify.innerHTML = `<span role="status">Submitted <i class="bi bi-cloud-check"></i></span>`;
          EstimatesVerify.disabled = true;
        }
        if (alreadyTriggered) return;
        if (failed.length === 0 && invRequiredList.length === 0) {
          alreadyTriggered = true;
          setTimeout(() => {
            console.log("All done, reloading...");
            EstimatesVerify.disabled = false;
            EstimatesVerify.click();
          }, 500);
        }
        if (failed.length > 0) {
          EstimatesVerify.innerHTML = `<span role="status">Try Again <i class="bi bi-arrow-repeat"></i></span>`;
        }
      })
      .catch((error) => {
        console.log(error);
        EstimatesVerify.innerHTML = `<span role="status">Upload <i class="bi bi-arrow-clockwise"></i></span>`;
      });
  });
}
// Process the verified estimates and collect the Invoices idf needed.
if (invoiceAttachmentsBtn) {
  invoiceAttachmentsBtn.addEventListener("change", function (e) {
    e.preventDefault();
    EstimatesVerify.disabled = false;
    if (!isEstimatesVerified) {
      alert("Please verify the estimates before proceeding to upload attachments.");
      return;
    }
    document.querySelectorAll('[id^="invoice-status-"]').forEach(label => {
      label.className = "badge text-bg-warning rounded-pill";
      label.textContent = "Pending";
    });
    const files = invoiceAttachmentsBtn.files;
    // if(files.length === 0){
    //   alert("Please select at least one attachment to upload.");
    //   return;
    // }
    const fileNames = Array.from(files).map(file => file.name.split(".")[0].replace(/[^a-zA-Z0-9]/g, ""));
    fileNames.forEach(fileName => {
      const statusLabel = document.getElementById(`invoice-status-${fileName}`);
      if (statusLabel) {
        statusLabel.className = "badge text-bg-info rounded-pill";
        statusLabel.textContent = "Attached";
      }
    });
    const normalizedInvList = [
      ...new Set(
        invAttachmentRequiredList
          .map(v => v?.trim()?.replace(/[^a-zA-Z0-9]/g, ""))
          .filter(v => v && v !== "-")
      )
    ];

    const missingInvoices = normalizedInvList.filter(
      inv => !fileNames.includes(inv)
    );

    if (missingInvoices.length > 0) {
      EstimatesVerify.disabled = true;
      alert(`Attachments missing for Invoice Numbers: ${missingInvoices.join(", ")}`);
    }
  })
}
// Import Estimates
if (EstimatesImport_Btn) {
  EstimatesImport_Btn.addEventListener("click", async function (e) {
    let f = EstimatesInputImport.files[0];
    let data = await f.arrayBuffer();
    let wb = XLSX.read(data);
    let json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
    });
    const dateColumns = ["ApprovedDate", "Invoiced Date", "Rejected Date", "Payment Received Date"];
    // Filter out empty rows
    json = json.filter(
      (row) =>
        !row.every((cell) => cell === undefined || cell === null || cell === "")
    );
    const headers = json[0];
    let finalData = json.map((row, index) => ({
      id: `estimate_row-${index}`,
      data: headers.reduce((acc, header, i) => {
        acc[header] = row[i];
        return acc;
      }, {}),
    }));
    finalData.shift();
    document.getElementById("Estimates_Import_Btn").innerHTML = `
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
    <span role="status">Importing...</span>`;
    finalData = finalData.map(row => {
      for (let key in row.data) {
        if (
          dateColumns.includes(key) &&
          typeof row.data[key] === "number" &&
          row.data[key] > 59
        ) {
          row.data[key] = excelDateToJSDate(row.data[key], true);
        }
      }
      return row;
    });
    axios
      .post("/api/importEstimate", { rows: finalData })
      .then((response) => {
        const { failed, success, warning } = response.data;
        document.getElementById("Import_Success_Count").innerText =
          success.length;
        document.getElementById("Import_Failed_Count").innerText =
          failed.length+warning.length;
        success.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-success-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .setAttribute("data-bs-title", log.message);
        });
        failed.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-danger-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .setAttribute("data-bs-title", log.message);
        });
        warning.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-warning-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .setAttribute("data-bs-title", log.message);
        });
        const tooltipTriggerList = document.querySelectorAll(
          '[data-bs-toggle="tooltip"]'
        );
        const tooltipList = [...tooltipTriggerList].map(
          (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
        );
        document.getElementById(
          "Estimates_Import_Btn"
        ).innerHTML = `<span role="status">Imported <i class="bi bi-cloud-check"></i></span>`;
      })
      .catch((error) => {
        console.log(error);
        document.getElementById(
          "Estimates_Import_Btn"
        ).innerHTML = `<span role="status">Import <i class="bi bi-arrow-clockwise"></i></span>`;
      });
  });
}
const Est_Customer = $("#Est_Customer").filterMultiSelect({
  selectAllText: "Select All",
  caseSensitive: false,
  placeholderText: "Nothing Selected",
});
const Est_Program = $("#Est_Program").filterMultiSelect({
  selectAllText: "Select All",
  caseSensitive: false,
  placeholderText: "Nothing Selected",
});
const Est_Status = $("#Est_Status").filterMultiSelect({
  selectAllText: "Select All",
  caseSensitive: false,
  placeholderText: "Nothing Selected",
});
let programSet = new Set();
const programMapping = {
  Mastec: ["MasTec-Tillman"],
  SkyTec: ["SkyTec-Comcast"],
  ATX: ["ATX-Comcast"],
  "AT&T": ["MasTec-AT&T"], // No programs for AT&T in this example
};
// Get references to the select elements
const customerSelect = document.getElementById("Est_Customer");
const programSelect = document.getElementById("Est_Program");

// Function to update the program options based on selected customers
customerSelect.addEventListener("change", function () {
  const selectedCustomers = Array.from(customerSelect.selectedOptions).map(
    (option) => option.value
  );
  // Clear existing program options
  programSelect.innerHTML = '<option value="">Select Program</option>';

  // Populate new program options
  const programSet = new Set(); // Use a Set to store unique program values

  selectedCustomers.forEach((customer) => {
    if (programMapping[customer]) {
      programMapping[customer].forEach((program) => programSet.add(program));
    }
  });

  // Add programs to the dropdown
  if (programSet.size > 0) {
    programSet.forEach((program) => {
      const option = document.createElement("option");
      option.value = program;
      option.textContent = program;
      programSelect.appendChild(option);
    });
  } else {
    // Show a message if no programs are available
    const noOption = document.createElement("option");
    noOption.value = "";
    noOption.textContent = "No programs available";
    programSelect.appendChild(noOption);
  }
});

$(function () {
  $("#draggable3").draggable({ containment: "window", scroll: false });
});

// For WorkDone Import
const WD_InputImport_File = document.getElementById("WD_Import_File");
const WD_Import_Btn = document.getElementById("WD_Import_Btn");
const WD_ImportCancel = document.getElementById("WD_Import_Cancel_Btn");
const WD_ExcelImportTable = document.getElementById("WD_excelImportTable");
if (WD_InputImport_File) {
  WD_InputImport_File.addEventListener(
    "change",
    (e) => handleDropAsync(e, WD_ExcelImportTable),
    false
  );
}
if (WD_ImportCancel) {
  WD_ImportCancel.addEventListener("click", function (e) {
    WD_InputImport_File.value = null;
    WD_ExcelImportTable.querySelector("thead").innerHTML = null;
    WD_ExcelImportTable.querySelector("tbody").innerHTML = null;
  });
}
// For WorkDone Import
if (WD_Import_Btn) {
  WD_Import_Btn.addEventListener("click", async function (e) {
    let f = WD_InputImport_File.files[0];
    let data = await f.arrayBuffer();
    let wb = XLSX.read(data);
    let jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      cellDates: true,
    });
    const WD_Date_Fields = ["Accounted Month"]
    jsonData = jsonData.map((item, index) => {
      const data = { ...item };
      for (const field of WD_Date_Fields) {
        data[field] = item[field] ? parseUSDate(item[field]) : null;
      }
      return {
        id: `WD_row-${index + 1}`,
        data
      };
    });
    document.getElementById("WD_Import_Btn").innerHTML = `
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
    <span role="status">Importing...</span>`;
    axios
      .post("/api/importWorkDone", { rows: jsonData })
      .then((response) => {
        const { failed, success, warning } = response.data;
        console.log(response.data)
        document.getElementById("WD_Import_Success_Count").innerText =
          success.length;
        document.getElementById("WD_Import_Failed_Count").innerText =
          failed.length + warning.length;
        success.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-success-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .setAttribute("data-bs-title", log.message);
        });
        failed.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-danger-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .setAttribute("data-bs-title", log.message);
        });
        warning.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-warning-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .setAttribute("data-bs-title", log.message);
        });
        const tooltipTriggerList = document.querySelectorAll(
          '[data-bs-toggle="tooltip"]'
        );
        const tooltipList = [...tooltipTriggerList].map(
          (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
        );
        document.getElementById(
          "WD_Import_Btn"
        ).innerHTML = `<span role="status">Imported <i class="bi bi-cloud-check"></i></span>`;
      })
      .catch((error) => {
        console.log(error);
        document.getElementById(
          "WD_Import_Btn"
        ).innerHTML = `<span role="status">Import <i class="bi bi-arrow-clockwise"></i></span>`;
      });
  });
}
// For WorkDone Update
const WD_Upload_File = document.getElementById("WD_Upload_File");
const WD_Upload = document.getElementById("WD_Upload_Btn");
const WD_Cancel = document.getElementById("WD_Cancel_Btn");
const WD_ExcelTable = document.getElementById("WD_excelTable");

if (WD_Upload_File) {
  WD_Upload_File.addEventListener("change", (e) => handleDropAsync(e, WD_ExcelTable));
}
if (WD_Cancel) {
  WD_Cancel.addEventListener("click", function (e) {
    WD_Upload_File.value = null;
    WD_ExcelTable.querySelector("thead").innerHTML = null;
    WD_ExcelTable.querySelector("tbody").innerHTML = null;
  });
}
if (WD_Upload) {
  WD_Upload.addEventListener("click", async function (e) {
    let f = WD_Upload_File.files[0];
    let data = await f.arrayBuffer();
    let wb = XLSX.read(data);
    let jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      cellDates: true,
    });
    const WD_Date_Fields = ["Accounted Month"]
    // const invalidRecords = jsonData.filter(row =>
    //   Number(row?.['Total Quantity']) < 0
    // )
    jsonData = jsonData.map((item, index) => {
      const data = { ...item };
      for (const field of WD_Date_Fields) {
        data[field] = item[field] ? parseUSDate(item[field]) : null;
      }
      return {
        id: `WD_row-${index + 1}`,
        data
      };
    });
    document.getElementById("WD_Upload_Btn").innerHTML = `
    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
    <span role="status">Uploading...</span>`;
    axios
      .post("/api/updateWorkDone", { rows: jsonData })
      .then((response) => {
        const { failed, success } = response.data;
        console.log(response.data)
        document.getElementById("WD_Upload_Success_Count").innerText =
          success.length;
        document.getElementById("WD_Upload_Failed_Count").innerText =
          failed.length;
        success.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-success-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .setAttribute("data-bs-title", log.message);
        });
        failed.forEach((log) => {
          let row = document.getElementById(log.id);
          row.classList.add("bg-danger-subtle", "bg-gradient");
          row
            .querySelector(`#${log.id}-Message`)
            .setAttribute("data-bs-title", log.message);
        });
        const tooltipTriggerList = document.querySelectorAll(
          '[data-bs-toggle="tooltip"]'
        );
        const tooltipList = [...tooltipTriggerList].map(
          (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
        );
        document.getElementById(
          "WD_Upload_Btn"
        ).innerHTML = `<span role="status">Uploaded <i class="bi bi-cloud-check"></i></span>`;
        document.getElementById(
          "WD_Upload_Btn"
        ).disabled = true;
      })
      .catch((error) => {
        console.log(error);
        document.getElementById(
          "WD_Upload_Btn"
        ).innerHTML = `<span role="status">Try Again <i class="bi bi-arrow-clockwise"></i></span>`;
      });
  });
}

const WD_Customer = $("#WD_Customer").filterMultiSelect({
  selectAllText: "Select All",
  caseSensitive: false,
  placeholderText: "Nothing Selected",
});
const WD_Program = $("#WD_Program").filterMultiSelect({
  selectAllText: "Select All",
  caseSensitive: false,
  placeholderText: "Nothing Selected",
});
try {


  // Get references to the select elements
  const WD_customerSelect = document.getElementById("WD_Customer");
  const WD_programSelect = document.getElementById("WD_Program");
  // Function to update the program options based on selected customers
  WD_customerSelect.addEventListener("change", function () {
    const selectedCustomers = Array.from(WD_customerSelect.selectedOptions).map(
      (option) => option.value
    );
    // Clear existing program options
    WD_programSelect.innerHTML = '<option value="">Select Program</option>';

    // Populate new program options
    const programSet = new Set(); // Use a Set to store unique program values

    selectedCustomers.forEach((customer) => {
      if (programMapping[customer]) {
        programMapping[customer].forEach((program) => programSet.add(program));
      }
    });

    // Add programs to the dropdown
    if (programSet.size > 0) {
      programSet.forEach((program) => {
        const option = document.createElement("option");
        option.value = program;
        option.textContent = program;
        programSelect.appendChild(option);
      });
    } else {
      // Show a message if no programs are available
      const noOption = document.createElement("option");
      noOption.value = "";
      noOption.textContent = "No programs available";
      programSelect.appendChild(noOption);
    }
  });
} catch (error) {
  console.log(error)
}
